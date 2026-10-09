import type { Ref } from "react";

type Props = { gemRef?: Ref<SVGGElement>; className?: string };

/** AD Smart School logo (brand asset: the only place raw colours are allowed). */
export function LogoMark({ gemRef, className }: Props) {
  return (
    <svg
      viewBox="195 365 1360 1035"
      className={className}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="adss-blue" gradientUnits="userSpaceOnUse" x1="560" y1="0" x2="1545" y2="0">
          <stop offset="0" stopColor="#0230A6" />
          <stop offset="1" stopColor="#0A78B8" />
        </linearGradient>
        <linearGradient id="adss-indigo" gradientUnits="userSpaceOnUse" x1="210" y1="0" x2="540" y2="0">
          <stop offset="0" stopColor="#0C0898" />
          <stop offset="1" stopColor="#0A26A4" />
        </linearGradient>
      </defs>
      {/* d: violet top, blue bottom, violet stem, amber dot */}
      <g fill="none" strokeWidth="140">
        <path d="M907.6 929.1 A292 292 0 0 1 1469.6 1079.7" stroke="#8806A8" />
        <path d="M1458.1 1124.1 A292 292 0 0 1 890 1029" stroke="url(#adss-blue)" />
      </g>
      <rect x="1404" y="557" width="141" height="523" fill="#8806A8" />
      <rect x="1404" y="373" width="141" height="145" fill="#F0AD1C" />
      {/* a: indigo, amber and blue arcs with the blue stem */}
      <g fill="none" strokeWidth="140">
        <path d="M283.2 985.8 A292 292 0 0 1 481.8 751.3" stroke="url(#adss-indigo)" />
        <path d="M617.7 1317.4 A292 292 0 0 1 280.1 1022.4" stroke="#F0AD1C" />
        <path d="M713.6 773.6 A292 292 0 0 1 642.6 1312.3" stroke="url(#adss-blue)" />
      </g>
      <rect x="794" y="1029" width="140" height="363" fill="url(#adss-blue)" />
      {/* gem: swings from its top centre */}
      <g ref={gemRef} style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}>
        <polygon points="367,512 440,388 508,512" fill="#0A12A0" />
        <polygon points="451,383 600,383 518,507" fill="#F0AD1C" />
        <polygon points="527,512 607,392 697,512" fill="#C4601F" />
        <polygon points="614,383 765,383 708,507" fill="#F0AD1C" />
        <polygon points="716,512 774,388 849,512" fill="#0A76B8" />
        <polygon points="369,522 512,522 599,806" fill="#8806A8" />
        <polygon points="522,522 700,522 608,816" fill="#8806A8" />
        <polygon points="710,522 848,522 618,806" fill="#8806A8" />
      </g>
    </svg>
  );
}
