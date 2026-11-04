export function blockAppWorker(hostname: string, production: boolean, framed: boolean, disabled: boolean, delegatedHost?: string) {
  const host = hostname.toLowerCase();
  if (!production || framed || disabled || host === delegatedHost?.toLowerCase()) return true;
  const platform = ["lovable.app", "gpt-eng.com", "gptengineer.run"].some((base) => host.endsWith(`.${base}`));
  const label = host.split(".")[0];
  if (platform && (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(label) || /^project--.+-dev$/.test(label))) return true;
  return ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"].some((base) => host === base || host.endsWith(`.${base}`));
}