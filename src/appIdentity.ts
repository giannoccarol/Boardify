import identities from "./app-identities.json";

export function normalizeApp(name: string): string {
  return (name.trim().split(/[/\\]/).pop() ?? name)
    .toLowerCase().replace(/\.(desktop|exe)$/, "").replace(/-bin$/, "")
    .replace(/[ _]+/g, "-");
}

export function appIdentity(name: string) {
  const key = normalizeApp(name);
  return identities.find((app) => [app.id, app.label, ...app.aliases].some((alias) => normalizeApp(alias) === key));
}
