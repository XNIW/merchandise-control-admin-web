export type StorefrontImageOption = {
  cardUrl: string | null;
  current: boolean;
  detailUrl: string | null;
  id: string;
  publishedAt: string | null;
  sourceImageVersionId: string | null;
  sourceProductId: string;
  status: string;
  thumbUrl: string | null;
  updatedAt: string | null;
  url: string | null;
};

export type StorefrontImageCandidate = {
  currentPublicImageId: string | null;
  name: string;
  publicationId: string;
  sourceImageVersionId: string;
  sourceProductId: string;
  sourceReady: boolean;
};
