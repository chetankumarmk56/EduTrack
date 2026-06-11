import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// iOS 15.0–15.3 lacks Object.hasOwn, which recharts' bundled utils call at
// runtime. esbuild's safari15 target downlevels syntax only, not APIs, so
// shim it here rather than pulling in a polyfill package.
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value: (obj: object, key: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(obj, key),
    writable: true,
    configurable: true,
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
