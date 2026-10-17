<?php
declare(strict_types=1);

// Write-only, same-origin page entry endpoint. Aggregate reports stay private.
ini_set('display_errors', '0');
header('Cache-Control: no-store, private, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');

function observatory_visit_response(int $status, string $message = ''): void {
    http_response_code($status);
    if ($status !== 204) echo json_encode(['error' => $message]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    observatory_visit_response(405, 'POST required.');
}
try {
    require_once __DIR__ . '/lib/visit-counter.php';
    if (!observatory_visit_origin_allowed($_SERVER)) observatory_visit_response(403, 'Request not allowed.');
    if (isset($_SERVER['CONTENT_LENGTH']) && (!ctype_digit((string) $_SERVER['CONTENT_LENGTH']) || (int) $_SERVER['CONTENT_LENGTH'] > 1024)) observatory_visit_response(413, 'Request too large.');
    $body = file_get_contents('php://input', false, null, 0, 1025);
    if ($body === false || strlen($body) > 1024) observatory_visit_response(413, 'Request too large.');
    if (observatory_visit_should_skip($_SERVER)) observatory_visit_response(204);
    $contentType = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') observatory_visit_response(415, 'JSON required.');
    try { $payload = json_decode($body, true, 4, JSON_THROW_ON_ERROR); }
    catch (Throwable $error) { observatory_visit_response(400, 'Invalid request.'); }
    if (!is_array($payload) || ($payload['event'] ?? null) !== 'page_open') observatory_visit_response(400, 'Invalid request.');
    observatory_record_visit(
        dirname(__DIR__, 3) . '/observatory-data',
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        (string) ($_SERVER['HTTP_USER_AGENT'] ?? '')
    );
    observatory_visit_response(204);
} catch (Throwable $error) {
    // Never expose paths, raw request data, salts, hashes, or aggregate counts.
    observatory_visit_response(503, 'Visitor counter unavailable.');
}
