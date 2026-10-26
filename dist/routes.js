export const DASHBOARD_VIEWS = ['overview','signals','permissions','fingerprints','boundaries','guide','compare','checkup','report'];
export const PUBLIC_SECTIONS = ['main','questions','how-it-works','developer','privacy','answers'];
export function parseRoute(hash = '') {
  const raw = String(hash).replace(/^#/, '');
  if (!raw) return {screen:'landing', section:'main'};
  if (PUBLIC_SECTIONS.includes(raw)) return {screen:'landing', section:raw};
  if (DASHBOARD_VIEWS.includes(raw)) return {screen:'dashboard', view:raw};
  return {screen:'landing', section:'main', unknown:true};
}
