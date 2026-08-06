import Image from "next/image";

type BrandLogoVariant = "light" | "dark" | "compact" | "stacked" | "icon";

const sources: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  light: { src: "/brand/logo-horizontal-light.png", width: 524, height: 197 },
  dark: { src: "/brand/logo-horizontal-dark.png", width: 399, height: 149 },
  compact: { src: "/brand/logo-compact.png", width: 495, height: 433 },
  stacked: { src: "/brand/logo-stacked.png", width: 398, height: 512 },
  icon: { src: "/brand/app-icon.png", width: 237, height: 235 },
};

export function BrandLogo({
  variant = "light",
  alt = "BrenUp",
  className = "",
  priority = false,
}: {
  variant?: BrandLogoVariant;
  alt?: string;
  className?: string;
  priority?: boolean;
}) {
  const source = sources[variant];
  return <Image src={source.src} alt={alt} width={source.width} height={source.height} priority={priority} className={`object-contain ${className}`} />;
}
