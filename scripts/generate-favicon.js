const fs = require('fs');

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="12" y="4" width="18" height="20" rx="2" fill="#1e40af"/>
  <rect x="14" y="6" width="14" height="10" fill="#93c5fd"/>
  <rect x="26" y="10" width="4" height="6" fill="#93c5fd"/>
  <rect x="14" y="18" width="14" height="6" fill="#fef3c7"/>
  <circle cx="12" cy="18" r="10" fill="#fcd34d"/>
  <circle cx="8" cy="14" r="5" fill="#1e40af"/>
  <circle cx="6" cy="12" r="1.5" fill="white"/>
  <ellipse cx="12" cy="20" rx="1.5" ry="1" fill="#78350f"/>
  <circle cx="9" cy="19" r="1" fill="#1f2937"/>
  <circle cx="15" cy="19" r="1" fill="#1f2937"/>
  <path d="M10 22 Q12 24 14 22" stroke="#78350f" stroke-width="1.5" fill="none"/>
  <ellipse cx="12" cy="17" rx="4" ry="2.5" fill="#ef4444"/>
  <rect x="18" y="24" width="6" height="4" rx="1" fill="#ef4444"/>
  <text x="21" y="27.5" font-size="3" fill="white" text-anchor="middle">保安</text>
</svg>`;

fs.writeFileSync('public/favicon.ico', Buffer.from(icon, 'utf-8'));
console.log('Favicon created');
