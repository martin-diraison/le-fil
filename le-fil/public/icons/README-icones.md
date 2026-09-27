# Icône — piste 3b « Encre sur jaune »

Jaune `#f2c015`, encre `#0a0a0a`, papier `#fbfbf9`. Pas d'arrondi dans les fichiers : l'OS applique le masque.

## Balises <head>
```html
<link rel="icon" href="/icons/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/icons/manifest.webmanifest">
<meta name="theme-color" content="#f2c015">
```

## Fichiers
- `icon.svg` / `favicon.svg` : version « any », motif agrandi.
- `icon-maskable.svg`, `icon-maskable-192/512.png` : motif dans la zone sûre de 80 %.
- `favicon-16.svg` / `favicon-16.png` : version simplifiée à deux lignes, pour le 16 px uniquement.
- `favicon-32/48.png` et `favicon.ico` (16 + 32 + 48).
- `apple-touch-icon.png` (180) et `icon-192/512.png` (Android / PWA).
- `icon-256-windows.png` et `icon-1024-macos.png` : sources pour le .ico Windows et le .icns macOS. Sur macOS, appliquer le gabarit squircle avec environ 10 % de marge.
