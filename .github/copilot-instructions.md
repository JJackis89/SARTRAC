# SARTRAC Project Instructions

This project is a React-based Sargassum forecast visualization application for Ghana's coastline.

## Project Overview
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: TailwindCSS with custom ocean theme
- **Mapping**: React Leaflet + Leaflet.js
- **Port**: 3850

## Key Features
- Map-based forecast visualization with color-coded Sargassum density
- Time-series animation controls (3-7 day forecasts)
- Interactive controls for layers, opacity, and base maps
- Ghana-focused regional navigation
- Forecast metadata and uncertainty indicators

## Development Setup
1. Run `npm install` to install dependencies
2. Run `npm run dev` to start development server on port 3850
3. Access application at http://localhost:3850

## Architecture
- `App.tsx`: Main application with state management
- `components/`: Reusable UI components for controls and overlays
- Custom CSS with Tailwind for oceanic theme
- Mock forecast data (ready for real API integration)

## File Structure
- Source code in `src/`
- Components separated by functionality
- TypeScript for type safety
- Vite for fast development builds