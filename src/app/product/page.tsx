import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserVisibleMenuKeys } from "@/lib/actions/permission";
import {
  getCachedInitialProducts,
  getProductCategories,
  getProductBrands,
} from "@/lib/actions/product";
import { ProductView } from "@/components/product/ProductView";

export const dynamic = "force-dynamic";

export default async function ProductPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const { id: userId, role } = session.user as { id: string; role: string };

  // Run permission check and taxonomy preload in parallel to eliminate server waterfall
  const [visibleKeys, categories, brands] = await Promise.all([
    role !== "ADMIN" ? getUserVisibleMenuKeys(userId) : Promise.resolve(null),
    getProductCategories(),
    getProductBrands(),
  ]);

  if (
    visibleKeys &&
    !visibleKeys.includes("product") &&
    !visibleKeys.includes("pipeline.information")
  ) {
    redirect("/");
  }

  const defaultCategories = categories.filter((c) => c.isDefault).map((c) => c.category);
  const defaultBrands = brands.filter((b) => b.isDefault).map((b) => b.brand);

  const productsResult = await getCachedInitialProducts({
    categories: defaultCategories.length > 0 ? defaultCategories : undefined,
    brands: defaultBrands.length > 0 ? defaultBrands : undefined,
  });

  const { products, stats, total } = productsResult;

  return (
    <ProductView
      initialProducts={products}
      initialStats={stats}
      initialTotal={total}
      initialCategories={categories}
      initialBrands={brands}
    />
  );
}
