// Credits each live source requires (see the attribution table in docs/SPEC.md).

/**
 * The Elexon credit names the current year. It is built per request: Workers freeze the clock at
 * the Unix epoch while a module loads, so a constant would say 1970.
 */
export function elexonCredit(now: Date = new Date()) {
  return {
    source: 'Elexon BMRS',
    text: `Contains BMRS data © Elexon Limited copyright and database right ${now.getUTCFullYear()}`,
    licence:
      'https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/',
  };
}

export const CARBON_INTENSITY_CREDIT = {
  source: 'Carbon Intensity API (NESO)',
  text: 'Carbon Intensity API (NESO), CC BY 4.0',
  licence: 'https://creativecommons.org/licenses/by/4.0/',
};

export const PV_LIVE_CREDIT = {
  source: 'Sheffield Solar PV_Live',
  text: 'PV_Live by Sheffield Solar is licensed under CC BY 4.0',
  licence: 'https://creativecommons.org/licenses/by/4.0/',
};
