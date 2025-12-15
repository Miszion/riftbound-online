# riftbound-online

A Next.js-powered fan-made landing page and sign-in screen inspired by the Riftbound card game from League of Legends.

## Features

- **Homepage** with hero section, feature cards, and navigation
- **Sign-in screen** with form validation and mock authentication
- **Responsive design** with card-game inspired aesthetics
- **TypeScript** support and modern React patterns
- **Next.js 14** with App Router

## Project Structure

```
app/
  layout.tsx          # Root layout with global styles
  page.tsx            # Homepage
  sign-in/
    page.tsx          # Sign-in page
components/
  Header.tsx          # Navigation header
  Footer.tsx          # Footer component
styles/
  globals.css         # Global styles and design tokens
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn

### Installation

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Deploy

```bash
npm run build
npm start
```

## Notes

- This is a static mockup with mock authentication. The sign-in form shows a client-side alert and does not persist credentials or communicate with a backend.
- All League of Legends and Riftbound trademarks are property of Riot Games. This is an unofficial fan project.

## License

This project is open source. All League of Legends intellectual property belongs to Riot Games.



