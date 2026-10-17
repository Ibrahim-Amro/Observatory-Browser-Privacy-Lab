<?php
declare(strict_types=1);

// Internal helpers only. Private aggregate statistics; never an HTTP report.
function observatory_visit_origin_allowed(array $server): bool {
    $site = strtolower((string) ($server['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($site === 'cross-site') return false;
    $origin = (string) ($server['HTTP_ORIGIN'] ?? '');
    if ($origin === '') return $site === 'same-origin';
    $host = (string) ($server['HTTP_HOST'] ?? '');
    if ($host === '' || strlen($host) > 255 || preg_match('~[\x00-\x20/?#@]~', $host) || strpos($host, chr(92)) !== false) return false;
    $https = (!empty($server['HTTPS']) && strtolower((string) $server['HTTPS']) !== 'off') || (string) ($server['SERVER_PORT'] ?? '') === '443';
    $scheme = $https ? 'https' : 'http';
    $expected = parse_url($scheme . '://' . $host);
    $provided = parse_url($origin);
    if (!is_array($expected) || !is_array($provided) || isset($provided['user']) || isset($provided['pass']) || isset($provided['query']) || isset($provided['fragment']) || ($provided['path'] ?? '') !== '') return false;
    return strtolower((string) ($provided['scheme'] ?? '')) === $scheme
        && strtolower((string) ($provided['host'] ?? '')) === strtolower((string) ($expected['host'] ?? ''))
        && ($provided['port'] ?? ($scheme === 'https' ? 443 : 80)) === ($expected['port'] ?? ($scheme === 'https' ? 443 : 80));
}

function observatory_visit_should_skip(array $server): bool {
    if (($server['HTTP_SEC_GPC'] ?? '') === '1' || ($server['HTTP_DNT'] ?? '') === '1') return true;
    $agent = substr((string) ($server['HTTP_USER_AGENT'] ?? ''), 0, 2048);
    return preg_match('/bot\b|crawler|spider|slurp|headlesschrome|lighthouse|facebookexternalhit|google-preview|bingpreview|uptimerobot|petalbot|bytespider|archive\.org|curl\/|wget\/|python-requests/i', $agent) === 1;
}

function observatory_visit_valid_day($day): bool {
    if (!is_string($day) || preg_match('/^\d{4}-\d{2}-\d{2}$/D', $day) !== 1) return false;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $day, new DateTimeZone('UTC'));
    return $date !== false && $date->format('Y-m-d') === $day;
}

function observatory_visit_validate_report($report): array {
    if (!is_array($report) || ($report['schemaVersion'] ?? null) !== 1) throw new RuntimeException('Counter unavailable.');
    foreach (['startedAt', 'lastVisitAt'] as $key) {
        if (!isset($report[$key]) || !is_string($report[$key]) || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $report[$key]) !== 1 || strtotime($report[$key]) === false) throw new RuntimeException('Counter unavailable.');
    }
    foreach (['totalPageViews', 'totalVisits'] as $key) {
        if (!isset($report[$key]) || !is_int($report[$key]) || $report[$key] < 0) throw new RuntimeException('Counter unavailable.');
    }
    if ($report['totalVisits'] > $report['totalPageViews']) throw new RuntimeException('Counter unavailable.');
    foreach (['dailyPageViews', 'dailyVisits', 'estimatedDailyVisitors'] as $key) {
        if (!isset($report[$key]) || !is_array($report[$key])) throw new RuntimeException('Counter unavailable.');
        foreach ($report[$key] as $day => $count) {
            if (!observatory_visit_valid_day($day) || !is_int($count) || $count < 0) throw new RuntimeException('Counter unavailable.');
        }
    }
    foreach ($report['dailyPageViews'] as $day => $views) {
        if (($report['dailyVisits'][$day] ?? 0) > $views || ($report['estimatedDailyVisitors'][$day] ?? 0) > $views) throw new RuntimeException('Counter unavailable.');
    }
    // Whitelist the aggregate schema: no private IDs/salt or arbitrary fields.
    return array_intersect_key($report, array_flip(['schemaVersion', 'startedAt', 'lastVisitAt', 'totalPageViews', 'totalVisits', 'dailyPageViews', 'dailyVisits', 'estimatedDailyVisitors']));
}

function observatory_visit_read_json(string $path): ?array {
    if (!file_exists($path)) return null;
    if (is_link($path) || !is_file($path) || filesize($path) > 16777216) throw new RuntimeException('Counter unavailable.');
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') throw new RuntimeException('Counter unavailable.');
    try { $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
    catch (Throwable $error) { throw new RuntimeException('Counter unavailable.'); }
    if (!is_array($decoded)) throw new RuntimeException('Counter unavailable.');
    return $decoded;
}

function observatory_visit_atomic_json(string $path, array $data): void {
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(8));
    $stream = @fopen($temporary, 'xb');
    if ($stream === false) throw new RuntimeException('Counter unavailable.');
    try {
        @chmod($temporary, 0600);
        $offset = 0;
        while ($offset < strlen($encoded)) {
            $written = @fwrite($stream, substr($encoded, $offset));
            if ($written === false || $written === 0) throw new RuntimeException('Counter unavailable.');
            $offset += $written;
        }
        if (!fflush($stream)) throw new RuntimeException('Counter unavailable.');
        if (function_exists('fsync') && !fsync($stream)) throw new RuntimeException('Counter unavailable.');
        fclose($stream); $stream = null;
        if (!@rename($temporary, $path)) throw new RuntimeException('Counter unavailable.');
    } finally {
        if (is_resource($stream)) fclose($stream);
        if (file_exists($temporary)) @unlink($temporary);
    }
}

/** Count a page entry. IP and UA are used in memory only, never written raw. */
function observatory_record_visit(string $directory, string $address, string $agent, ?int $now = null): array {
    $now = $now ?? time();
    if ($now < 0 || filter_var($address, FILTER_VALIDATE_IP) === false) throw new RuntimeException('Counter unavailable.');
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Counter unavailable.');
    if (is_link($directory)) throw new RuntimeException('Counter unavailable.');
    $lockPath = $directory . '/visitor-counter.lock';
    if (is_link($lockPath)) throw new RuntimeException('Counter unavailable.');
    $lock = @fopen($lockPath, 'c');
    if ($lock === false) throw new RuntimeException('Counter unavailable.');
    @chmod($lockPath, 0600);
    $locked = false;
    try {
        $deadline = microtime(true) + 3;
        do {
            $locked = flock($lock, LOCK_EX | LOCK_NB);
            if (!$locked) usleep(10000);
        } while (!$locked && microtime(true) < $deadline);
        if (!$locked) throw new RuntimeException('Counter unavailable.');
        $statePath = $directory . '/visitor-state.json';
        $reportPath = $directory . '/visitor-stats.json';
        // Validate both existing files before replacing either. Corruption is
        // never treated as an empty counter and historical totals are retained.
        $state = observatory_visit_read_json($statePath);
        $existingReport = observatory_visit_read_json($reportPath);
        if ($existingReport !== null) $existingReport = observatory_visit_validate_report($existingReport);
        $day = gmdate('Y-m-d', $now);
        $iso = gmdate('Y-m-d\TH:i:s\Z', $now);
        if ($state !== null) {
            if (($state['schemaVersion'] ?? null) !== 1 || !observatory_visit_valid_day($state['activeDay'] ?? null) || !is_string($state['activeSalt'] ?? null) || preg_match('/^[a-f0-9]{64}$/D', $state['activeSalt']) !== 1 || !is_array($state['activeVisitors'] ?? null)) throw new RuntimeException('Counter unavailable.');
            foreach ($state['activeVisitors'] as $hash => $lastSeen) {
                if (!is_string($hash) || preg_match('/^[a-f0-9]{64}$/D', $hash) !== 1 || !is_int($lastSeen) || $lastSeen < 0) throw new RuntimeException('Counter unavailable.');
            }
            $report = observatory_visit_validate_report($state['report'] ?? null);
        } else {
            $report = $existingReport ?? ['schemaVersion' => 1, 'startedAt' => $iso, 'lastVisitAt' => $iso, 'totalPageViews' => 0, 'totalVisits' => 0, 'dailyPageViews' => [], 'dailyVisits' => [], 'estimatedDailyVisitors' => []];
            $state = ['schemaVersion' => 1, 'activeDay' => $day, 'activeSalt' => bin2hex(random_bytes(32)), 'activeVisitors' => []];
        }
        if ($state['activeDay'] !== $day) {
            $state['activeDay'] = $day;
            $state['activeSalt'] = bin2hex(random_bytes(32));
            $state['activeVisitors'] = [];
        }
        $identity = hash_hmac('sha256', inet_pton($address) . "\0" . substr($agent, 0, 2048), hex2bin($state['activeSalt']));
        $lastSeen = $state['activeVisitors'][$identity] ?? null;
        $newVisit = $lastSeen === null || $now - $lastSeen >= 1800;
        $newDailyVisitor = $lastSeen === null;
        $state['activeVisitors'][$identity] = max($now, $lastSeen ?? 0);
        $report['totalPageViews']++;
        if ($newVisit) $report['totalVisits']++;
        $report['lastVisitAt'] = $iso;
        foreach (['dailyPageViews' => 1, 'dailyVisits' => $newVisit ? 1 : 0, 'estimatedDailyVisitors' => $newDailyVisitor ? 1 : 0] as $key => $increment) {
            $report[$key][$day] = ($report[$key][$day] ?? 0) + $increment;
            $cutoff = gmdate('Y-m-d', $now - 89 * 86400);
            foreach (array_keys($report[$key]) as $date) if ($date < $cutoff) unset($report[$key][$date]);
            ksort($report[$key]);
        }
        $report = observatory_visit_validate_report($report);
        $state['report'] = $report;
        // The state is authoritative; a later request can repair a stale or
        // missing aggregate snapshot after an interrupted second replacement.
        observatory_visit_atomic_json($statePath, $state);
        observatory_visit_atomic_json($reportPath, $report);
        return $report;
    } finally {
        if ($locked) flock($lock, LOCK_UN);
        fclose($lock);
    }
}
