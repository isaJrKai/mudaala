CREATE TABLE "ShopFollow" (
  "id" TEXT NOT NULL,
  "followerId" TEXT NOT NULL,
  "shopOwnerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopFollow_followerId_shopOwnerId_key" ON "ShopFollow"("followerId", "shopOwnerId");
CREATE INDEX "ShopFollow_followerId_createdAt_idx" ON "ShopFollow"("followerId", "createdAt");
CREATE INDEX "ShopFollow_shopOwnerId_createdAt_idx" ON "ShopFollow"("shopOwnerId", "createdAt");
ALTER TABLE "ShopFollow" ADD CONSTRAINT "ShopFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopFollow" ADD CONSTRAINT "ShopFollow_shopOwnerId_fkey" FOREIGN KEY ("shopOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
