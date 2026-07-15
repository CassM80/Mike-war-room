# War Room — Production Sprint 22.4

Fixes reset persistence at the hydration layer. Reset intent is applied before personal evaluations load, autosave is suppressed during reset, and navigation uses a cache-busting reload. The service worker now uses network-first navigation so stale app shells do not restore old reset logic.
