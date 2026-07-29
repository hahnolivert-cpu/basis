// Shared SWR fetcher. `cache: "no-store"` belts-and-braces the no-store
// headers the routes send, so a stale body can't be served from the browser
// cache even if a proxy strips them.
export const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());
