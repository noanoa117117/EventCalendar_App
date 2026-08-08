export function NightScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none">
      <div className="scene-sky pointer-events-none fixed inset-0" />
      <div className="scene-stars pointer-events-none fixed inset-0" />
      <div className="scene-stars-2 pointer-events-none fixed inset-0" />
      <div className="scene-moon pointer-events-none fixed" />
      <div className="scene-meteor pointer-events-none fixed m-a" />
      <div className="scene-meteor pointer-events-none fixed m-b" />
      <div className="scene-meteor pointer-events-none fixed m-c" />

      <div className="scene-sea pointer-events-none fixed inset-x-0 bottom-0">
        <div className="scene-sheen" />
        <div className="scene-glitter" />
        <div className="scene-swell s1" />
        <div className="scene-swell s2" />
        <div className="scene-swell s3" />
        <div className="scene-wash w2" />
        <div className="scene-wash" />
        <div className="scene-sand" />
        <div className="scene-palm p1">
          <svg viewBox="0 0 140 240" preserveAspectRatio="xMidYMax meet">
            <g fill="var(--scene-silhouette)">
              <path d="M62 240 C64 200 66 165 63 135 C61 115 66 98 70 85 C74 98 76 118 73 136 C71 168 74 204 78 240Z" />
              <path d="M68 100 C52 90 38 86 22 90 C38 76 52 78 68 88 C55 65 48 50 50 32 C62 50 70 72 72 92 C84 72 96 62 115 64 C98 80 86 92 74 100Z" />
              <path d="M72 95 C82 80 94 74 112 72 C98 86 88 94 76 98" />
              <path d="M66 98 C54 82 42 74 24 72 C38 84 50 92 64 97" />
              <path d="M70 90 C68 72 72 56 82 40 C78 58 76 74 72 90" />
              <path d="M68 92 C64 74 58 58 48 44 C56 60 62 76 66 92" />
            </g>
          </svg>
        </div>
        <div className="scene-palm p2">
          <svg viewBox="0 0 120 200" preserveAspectRatio="xMidYMax meet" style={{ transform: "scaleX(-1)" }}>
            <g fill="var(--scene-silhouette)">
              <path d="M54 200 C56 170 57 142 55 118 C53 102 57 88 60 78 C63 88 64 104 62 119 C60 144 63 174 66 200Z" />
              <path d="M58 90 C46 82 36 80 24 82 C36 72 46 73 58 80 C48 64 42 52 44 38 C52 52 58 66 60 82 C68 66 78 58 92 60 C80 70 72 80 62 88Z" />
              <path d="M62 86 C70 74 80 68 94 66 C82 78 74 84 64 88" />
              <path d="M56 88 C48 74 38 68 24 66 C36 76 44 84 54 88" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
