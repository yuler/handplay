const DEBUG_KEY = 'handplay:debug';

function readDebug(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('debug');
    if (q === '1') sessionStorage.setItem(DEBUG_KEY, '1');
    else if (q === '0') sessionStorage.removeItem(DEBUG_KEY);
    return sessionStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/** `?debug=1` (sticky for the tab session): skeletons, face contour and the fps tag. */
export const DEBUG = readDebug();
