export const getExcludedPortfolioTag = ({
  isExcludedFromPortfolio,
  isRsu,
}: {
  isExcludedFromPortfolio: boolean;
  isRsu: boolean;
}): string => {
  if (!isExcludedFromPortfolio) {
    return '';
  }
  return isRsu ? ' [RSU]' : ' [Excluded]';
};

export const getExcludedPortfolioDescription = ({
  isExcludedFromPortfolio,
  isRsu,
}: {
  isExcludedFromPortfolio: boolean;
  isRsu: boolean;
}): string => {
  if (!isExcludedFromPortfolio) {
    return '';
  }
  return isRsu ? ' - RSU (excluded from portfolio totals)' : ' - Excluded from portfolio totals';
};
