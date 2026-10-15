/**
 * Project links in one place (PRD "Repository, hosting and reports"). Store links stay
 * unset until a listing exists; a URL containing "<" is treated as unset and is never
 * opened or registered.
 */
export const CONFIG = {
  githubUser: "rahulcv1003",
  repoName: "crumble-cookie-cleaner",
  /** Short optional uninstall feedback form. No user data is ever added to this URL. */
  uninstallFormUrl: "https://rahulcv1003.github.io/crumble-cookie-cleaner/uninstall.html",
  changelogUrl: "https://rahulcv1003.github.io/crumble-cookie-cleaner/changelog.html",
  privacyUrl: "https://rahulcv1003.github.io/crumble-cookie-cleaner/privacy.html",
  storeReviewUrl: "https://chromewebstore.google.com/detail/<extension-id>/reviews",
  newIssueUrl: "https://github.com/rahulcv1003/crumble-cookie-cleaner/issues/new?template=bug_report.yml",
} as const;

export const isSet = (url: string): boolean => !url.includes("<");
