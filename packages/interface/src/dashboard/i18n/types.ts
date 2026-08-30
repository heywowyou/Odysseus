export type DashboardLanguage = 'fr' | 'en';

/** Copy for one dashboard page: the header block plus the placeholder a stub
 *  route shows until its slice builds the real page. */
export interface PageCopy {
  title: string;
  description: string;
  placeholder: string;
}

export interface DashboardStrings {
  nav: {
    audits: string;
    newScan: string;
  };
  shell: {
    tagline: string;
    navigation: string;
    openMenu: string;
    closeMenu: string;
    language: string;
  };
  page: {
    audits: PageCopy;
    newScan: PageCopy;
    scanProgress: PageCopy;
    auditDetail: PageCopy;
  };
}
