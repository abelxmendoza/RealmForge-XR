/** `?studio=1` opens the Creative Studio instead of the landing page or editor. */
export const isStudioEntry = (search: string) => new URLSearchParams(search).get('studio') === '1'
