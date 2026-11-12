// Things the app puts on `window` itself or that the phone adds (Capacitor). Declared here so the TypeScript check knows them.
interface Window {
  __REV: string;
  __wnReady: () => void;
  __wnErrors: string[];
  __tsGap: any;
  WN_CONFIG: any;
  Capacitor: any;
}
