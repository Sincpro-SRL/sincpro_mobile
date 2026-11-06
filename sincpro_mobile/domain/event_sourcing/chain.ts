export type Chain = {
  causationId: string | null;
  correlationId: string;
};

export function chainAfter(
  causeId: string | null,
  causeCorrelation: string | null,
  ownId: string,
): Chain {
  return {
    causationId: causeId,
    correlationId: causeCorrelation || causeId || ownId,
  };
}
