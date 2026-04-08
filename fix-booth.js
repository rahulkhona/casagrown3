const fs = require('fs');
const path = './apps/next-market/app/(main)/my-booth/page.tsx';
let data = fs.readFileSync(path, 'utf8');

// 1. Add Import
data = data.replace(
  "import { LoadingSpinner } from '../../components/LoadingSpinner'",
  "import { LoadingSpinner } from '../../components/LoadingSpinner'\nimport SocialShareModal from '../../components/SocialShareModal'"
);

// 2. Replace the modal logic
const searchBoundary = "{/* ── Share Booth Modal (after save) ── */}";
const endBoundary = "onClick={() => setShowBoothShareModal(false)}\n            >Close</button>\n          </div>\n        </>\n      )}";

if (data.indexOf(searchBoundary) === -1 || data.indexOf(endBoundary) === -1) {
  console.log("Boundary not found");
  process.exit(1);
}

const replacement = `{/* ── Share Booth Modal (after save) ── */}
      <SocialShareModal
        isOpen={showBoothShareModal}
        onClose={() => setShowBoothShareModal(false)}
        title={\`\${name} Saved!\`}
        subtitle={"Invite your neighbors to check out your booth."}
        entityName={name}
        shareUrl={getBoothShareUrl() || ''}
        shareMessage={boothShareMsg}
      />`;

const startIdx = data.indexOf(searchBoundary);
const endIdx = data.indexOf(endBoundary) + endBoundary.length;

const newData = data.substring(0, startIdx) + replacement + data.substring(endIdx);
fs.writeFileSync(path, newData, 'utf8');
console.log("Replaced successfully!");
