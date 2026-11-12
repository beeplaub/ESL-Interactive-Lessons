export const SOCIAL_PLATFORMS = ["youtube", "linkedin", "facebook", "twitter", "instagram"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type ProfileSocialLinks = Partial<Record<SocialPlatform, string>>;

export const SOCIAL_PLATFORM_INFO: Record<SocialPlatform, { label: string; placeholder: string; hosts: string[] }> = {
  youtube: { label: "YouTube", placeholder: "youtube.com/@yourchannel", hosts: ["youtube.com", "youtu.be"] },
  linkedin: { label: "LinkedIn", placeholder: "linkedin.com/in/yourname", hosts: ["linkedin.com"] },
  facebook: { label: "Facebook", placeholder: "facebook.com/yourprofile", hosts: ["facebook.com", "fb.com"] },
  twitter: { label: "Twitter / X", placeholder: "x.com/yourname", hosts: ["x.com", "twitter.com"] },
  instagram: { label: "Instagram", placeholder: "instagram.com/yourname", hosts: ["instagram.com"] },
};

export function parseProfileSocialLinks(value: unknown): ProfileSocialLinks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const links: ProfileSocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const link = (value as Record<string, unknown>)[platform];
    if (typeof link === "string" && link.trim()) links[platform] = link.trim();
  }
  return links;
}
