import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const PUBLIC_BUCKET = "storefront-product-images";
const PRIVATE_BUCKET = "product-images";
const SHOP_ID = "51000000-0000-4000-8000-000000000013";
const SHOP_SLUG = "storefront-v1-staging";
const FIXTURE_EMAIL = "storefront-v1-fixture@example.invalid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLIC_PATH = new RegExp(
  `^shops/${SHOP_ID}/products/[0-9a-f-]{36}/public/[0-9a-f-]{36}/(thumb|card|detail)-[0-9a-f]{16}\\.webp$`,
);
const sourceJpeg = Buffer.from(
  "/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ9AFA4//9k=",
  "base64",
);
const sourceSha256 = createHash("sha256").update(sourceJpeg).digest("hex");

const categories = [
  {
    internalId: "52000000-0000-4000-8000-000000000001",
    publicId: "53000000-0000-4000-8000-000000000001",
    slug: "cafe",
    name: "Café",
  },
  {
    internalId: "52000000-0000-4000-8000-000000000002",
    publicId: "53000000-0000-4000-8000-000000000002",
    slug: "te",
    name: "Té",
  },
  {
    internalId: "52000000-0000-4000-8000-000000000003",
    publicId: "53000000-0000-4000-8000-000000000003",
    slug: "despensa",
    name: "Despensa",
  },
];

const products = [
  {
    productId: "54000000-0000-4000-8000-000000000001",
    sourceImageId: "55000000-0000-4000-8000-000000000001",
    imageId: "56000000-0000-4000-8000-000000000001",
    publicationId: "57000000-0000-4000-8000-000000000001",
    category: categories[0],
    barcode: "SFV1001",
    internalName: "Café grano fixture",
    publicName: "Café en grano 500 g",
    brand: "Casa Central",
    price: 4990,
    featured: true,
    sortRank: 1,
  },
  {
    productId: "54000000-0000-4000-8000-000000000002",
    sourceImageId: "55000000-0000-4000-8000-000000000002",
    imageId: "56000000-0000-4000-8000-000000000002",
    publicationId: "57000000-0000-4000-8000-000000000002",
    category: categories[1],
    barcode: "SFV1002",
    internalName: "Té verde fixture",
    publicName: "Té verde 20 bolsas",
    brand: "Casa Central",
    price: 1990,
    featured: false,
    sortRank: 2,
  },
  {
    productId: "54000000-0000-4000-8000-000000000003",
    sourceImageId: "55000000-0000-4000-8000-000000000003",
    imageId: "56000000-0000-4000-8000-000000000003",
    publicationId: "57000000-0000-4000-8000-000000000003",
    category: categories[2],
    barcode: "SFV1003",
    internalName: "Chocolate fixture",
    publicName: "Chocolate amargo 100 g",
    brand: "Casa Central",
    price: 2590,
    featured: true,
    sortRank: 3,
  },
  {
    productId: "54000000-0000-4000-8000-000000000004",
    sourceImageId: "55000000-0000-4000-8000-000000000004",
    imageId: "56000000-0000-4000-8000-000000000004",
    publicationId: "57000000-0000-4000-8000-000000000004",
    category: categories[2],
    barcode: "SFV1004",
    internalName: "Galletas fixture",
    publicName: "Galletas de avena 180 g",
    brand: "Casa Central",
    price: 1890,
    featured: false,
    sortRank: 4,
  },
];

function required(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

export function validateClientFixtureTarget(env = process.env) {
  if (
    env.STOREFRONT_CLIENT_FIXTURE_ALLOW_STAGING !== "yes" ||
    env.TEST_TARGET !== "staging" ||
    env.GITHUB_REF !== "refs/heads/integration/storefront-v1"
  ) {
    throw new Error("client_fixture_not_authorized");
  }
  const projectRef = required("STAGING_SUPABASE_PROJECT_REF", env);
  const allowed = required("ALLOWED_STAGING_SUPABASE_PROJECT_REFS", env)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const supabase = new URL(required("NEXT_PUBLIC_SUPABASE_URL", env));
  const database = new URL(required("STOREFRONT_STAGING_DATABASE_URL", env));
  if (
    !/^[a-z0-9]{20}$/.test(projectRef) ||
    !allowed.includes(projectRef) ||
    supabase.protocol !== "https:" ||
    supabase.hostname !== `${projectRef}.supabase.co` ||
    database.protocol !== "postgresql:" ||
    database.hostname !== "aws-1-sa-east-1.pooler.supabase.com" ||
    decodeURIComponent(database.username) !== `postgres.${projectRef}` ||
    database.searchParams.get("sslmode") !== "require" ||
    env.STOREFRONT_CLIENT_FIXTURE_SHOP_SLUG !== SHOP_SLUG
  ) {
    throw new Error("client_fixture_target_rejected");
  }
  return {
    databaseUrl: database.toString(),
    projectRef,
    supabaseOrigin: supabase.origin,
  };
}

async function fixtureUserId(client, databaseUrl) {
  let existing = "";
  try {
    existing = execFileSync(
      "psql",
      [
        databaseUrl,
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `select id from auth.users where email='${FIXTURE_EMAIL}' limit 2`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    throw new Error("client_fixture_user_lookup_failed");
  }
  if (existing) {
    const rows = existing.split(/\r?\n/).filter(Boolean);
    if (rows.length !== 1 || !UUID.test(rows[0])) {
      throw new Error("client_fixture_user_lookup_invalid");
    }
    return rows[0];
  }
  const created = await client.auth.admin.createUser({
    email: FIXTURE_EMAIL,
    email_confirm: true,
    password: `Fixture-${randomBytes(24).toString("base64url")}`,
  });
  if (created.error || !created.data.user) {
    throw new Error("client_fixture_user_create_failed");
  }
  return created.data.user.id;
}

async function publicAssets(origin) {
  const dimensions = { thumb: 320, card: 720, detail: 1200 };
  const result = {};
  for (const [variant, size] of Object.entries(dimensions)) {
    const bytes = await sharp(sourceJpeg)
      .resize(size, size, { fit: "cover" })
      .webp({ effort: 6, quality: 82 })
      .toBuffer();
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.format !== "webp" ||
      metadata.width !== size ||
      metadata.height !== size ||
      bytes.length < 1
    ) {
      throw new Error("client_fixture_webp_invalid");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    result[variant] = { bytes, height: size, sha256, width: size };
  }
  return { origin, variants: result };
}

function pathsFor(product, assets) {
  const publicPaths = Object.fromEntries(
    Object.entries(assets.variants).map(([variant, asset]) => [
      variant,
      `shops/${SHOP_ID}/products/${product.productId}/public/${product.imageId}/${variant}-${asset.sha256.slice(0, 16)}.webp`,
    ]),
  );
  return {
    main: `shops/${SHOP_ID}/products/${product.productId}/primary/${product.sourceImageId}/main.jpg`,
    thumb: `shops/${SHOP_ID}/products/${product.productId}/primary/${product.sourceImageId}/thumb.jpg`,
    publicPaths,
  };
}

async function uploadAssets(client, assets) {
  const existing = await client
    .from("storefront_image_publication_variants")
    .select("object_path")
    .eq("shop_id", SHOP_ID);
  if (existing.error) throw new Error("client_fixture_existing_assets_failed");
  const stale = existing.data
    .map((item) => item.object_path)
    .filter((path) => PUBLIC_PATH.test(path));
  if (stale.length > 0) {
    const removed = await client.storage.from(PUBLIC_BUCKET).remove(stale);
    if (removed.error) throw new Error("client_fixture_stale_assets_failed");
  }

  for (const product of products) {
    const paths = pathsFor(product, assets);
    for (const path of [paths.main, paths.thumb]) {
      const upload = await client.storage.from(PRIVATE_BUCKET).upload(path, sourceJpeg, {
        cacheControl: "3600",
        contentType: "image/jpeg",
        upsert: true,
      });
      if (upload.error) throw new Error("client_fixture_source_upload_failed");
    }
    for (const [variant, asset] of Object.entries(assets.variants)) {
      const upload = await client.storage
        .from(PUBLIC_BUCKET)
        .upload(paths.publicPaths[variant], asset.bytes, {
          cacheControl: "31536000",
          contentType: "image/webp",
          upsert: true,
        });
      if (upload.error) throw new Error("client_fixture_public_upload_failed");
    }
  }
}

function seedSql(userId, assets) {
  if (!UUID.test(userId)) throw new Error("client_fixture_user_id_invalid");
  const inventoryCategoryRows = categories
    .map(
      (category) =>
        `('${category.internalId}'::uuid,'${userId}'::uuid,'${SHOP_ID}'::uuid,'${category.name} interna',statement_timestamp())`,
    )
    .join(",\n");
  const publicCategoryRows = categories
    .map(
      (category, index) =>
        `('${category.publicId}'::uuid,'${SHOP_ID}'::uuid,'${category.internalId}'::uuid,'${category.slug}','${category.name}','published',${index + 1})`,
    )
    .join(",\n");
  const inventoryProductRows = products
    .map(
      (product) =>
        `('${product.productId}'::uuid,'${userId}'::uuid,'${SHOP_ID}'::uuid,'${product.barcode}','${product.internalName}','${product.category.internalId}'::uuid,900,${product.price},25,statement_timestamp())`,
    )
    .join(",\n");
  const sourceImageRows = products
    .map((product) => {
      const paths = pathsFor(product, assets);
      return `('${product.sourceImageId}'::uuid,'${SHOP_ID}'::uuid,'${product.productId}'::uuid,'ready','${paths.main}','${paths.thumb}','${sourceSha256}',${sourceJpeg.length},2,3,'${sourceSha256}',${sourceJpeg.length},2,3,'${sourceSha256}',${sourceJpeg.length},2,3,'image/jpeg','${sourceSha256}',${sourceJpeg.length},2,3,'image/jpeg','${userId}'::uuid,'${userId}'::uuid,'personal_account',statement_timestamp())`;
    })
    .join(",\n");
  const imageRows = products
    .map((product) => {
      const paths = pathsFor(product, assets);
      const detail = assets.variants.detail;
      const url = (variant) =>
        `${assets.origin}/storage/v1/object/public/${PUBLIC_BUCKET}/${paths.publicPaths[variant]}`;
      return `('${product.imageId}'::uuid,'${SHOP_ID}'::uuid,'${product.productId}'::uuid,'${product.sourceImageId}'::uuid,'published','${product.imageId}','${url("thumb")}','${url("card")}','${url("detail")}',${detail.width},${detail.height},'image/webp','${detail.sha256}',statement_timestamp())`;
    })
    .join(",\n");
  const variantRows = products
    .flatMap((product) => {
      const paths = pathsFor(product, assets);
      return Object.entries(assets.variants).map(([variant, asset]) => {
        const url = `${assets.origin}/storage/v1/object/public/${PUBLIC_BUCKET}/${paths.publicPaths[variant]}`;
        return `('${SHOP_ID}'::uuid,'${product.imageId}'::uuid,'${variant}','${paths.publicPaths[variant]}','${url}','ready',${asset.bytes.length},${asset.width},${asset.height},'${asset.sha256}',${asset.bytes.length},${asset.width},${asset.height},'${asset.sha256}','image/webp',statement_timestamp())`;
      });
    })
    .join(",\n");
  const publicationRows = products
    .map(
      (product) =>
        `('${product.publicationId}'::uuid,'${SHOP_ID}'::uuid,'${product.productId}'::uuid,'published','${product.publicName}','Producto público de fixture Storefront v1','${product.category.publicId}'::uuid,'${product.brand}',${product.price},'override',${product.featured},${product.sortRank},true,true,false,'available','${product.imageId}'::uuid,statement_timestamp(),'${userId}'::uuid)`,
    )
    .join(",\n");

  return `
begin;
alter table public.audit_logs disable trigger user;
delete from public.audit_logs where shop_id='${SHOP_ID}'::uuid;
alter table public.audit_logs enable trigger user;
delete from public.shops where shop_id='${SHOP_ID}'::uuid;
insert into public.profiles(profile_id,display_name,profile_status)
values ('${userId}'::uuid,'Storefront v1 fixture','active')
on conflict (profile_id) do update set display_name=excluded.display_name, profile_status='active';
insert into public.shops(shop_id,shop_code,shop_name,shop_status,created_by_profile_id,status_changed_by_profile_id)
values ('${SHOP_ID}'::uuid,'SFV1STAGING','Storefront v1 staging','active','${userId}'::uuid,'${userId}'::uuid);
insert into public.shop_members(profile_id,shop_id,role_key,membership_status)
values ('${userId}'::uuid,'${SHOP_ID}'::uuid,'shop_owner','active');
insert into public.inventory_categories(id,owner_user_id,shop_id,name,updated_at) values
${inventoryCategoryRows};
insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name,category_id,purchase_price,retail_price,stock_quantity,updated_at) values
${inventoryProductRows};
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
insert into public.inventory_product_image_versions(
  id,shop_id,product_id,status,main_path,thumb_path,
  expected_main_sha256,expected_main_bytes,expected_main_width,expected_main_height,
  expected_thumb_sha256,expected_thumb_bytes,expected_thumb_width,expected_thumb_height,
  verified_main_sha256,verified_main_bytes,verified_main_width,verified_main_height,verified_main_mime_type,
  verified_thumb_sha256,verified_thumb_bytes,verified_thumb_width,verified_thumb_height,verified_thumb_mime_type,
  requested_by_profile_id,finalized_by_profile_id,actor_kind,finalized_at
) values
${sourceImageRows};
${products.map((product) => `update public.inventory_products set primary_image_version_id='${product.sourceImageId}'::uuid, primary_image_updated_at=statement_timestamp() where id='${product.productId}'::uuid;`).join("\n")}
insert into public.storefront_settings(shop_id,public_slug,storefront_enabled,pickup_enabled,delivery_enabled,reservation_enabled,require_product_image,updated_by_profile_id)
values ('${SHOP_ID}'::uuid,'${SHOP_SLUG}',true,true,true,false,true,'${userId}'::uuid);
insert into public.storefront_categories(id,shop_id,source_category_id,slug,public_name,publication_status,sort_rank) values
${publicCategoryRows};
insert into public.storefront_image_publications(
  id,shop_id,source_product_id,source_image_version_id,publication_status,version_key,
  thumb_url,card_url,detail_url,width,height,content_type,content_sha256,published_at
) values
${imageRows};
insert into public.storefront_image_publication_variants(
  shop_id,image_publication_id,variant,object_path,public_url,publication_status,
  expected_bytes,expected_width,expected_height,expected_sha256,
  verified_bytes,verified_width,verified_height,verified_sha256,content_type,ready_at
) values
${variantRows};
insert into public.storefront_product_publications(
  id,shop_id,source_product_id,publication_status,public_name,public_description,
  public_category_id,public_brand,retail_price_clp,price_source_mode,featured,sort_rank,
  pickup_enabled,delivery_enabled,reservation_enabled,availability_mode,
  published_image_version_id,published_at,updated_by_profile_id
) values
${publicationRows};
insert into public.storefront_promotions(
  id,shop_id,public_name,publication_status,discount_type,discount_value,priority,
  starts_at,ends_at,updated_by_profile_id
) values (
  '58000000-0000-4000-8000-000000000001'::uuid,'${SHOP_ID}'::uuid,
  'Oferta de bienvenida','active','fixed_price_clp',1490,100,
  statement_timestamp()-interval '1 day',statement_timestamp()+interval '30 days','${userId}'::uuid
);
insert into public.storefront_promotion_products(shop_id,promotion_id,publication_id,created_by_profile_id)
values ('${SHOP_ID}'::uuid,'58000000-0000-4000-8000-000000000001'::uuid,'${products[1].publicationId}'::uuid,'${userId}'::uuid);
select app_private.storefront_catalog_rebuild_shop_v1('${SHOP_ID}'::uuid,statement_timestamp());
commit;
`;
}

async function verifyPublicContract(origin, publishableKey) {
  const anon = createClient(origin, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "storefront-v1-client-fixture" } },
  });
  const home = await anon.rpc("storefront_home_v1", {
    p_category_limit: 12,
    p_featured_limit: 8,
    p_offer_limit: 8,
    p_shop_slug: SHOP_SLUG,
  });
  if (home.error || home.data?.status !== "ok") {
    throw new Error("client_fixture_home_rpc_failed");
  }
  const payload = home.data;
  const items = [...payload.featured, ...payload.offers];
  if (
    payload.apiVersion !== "storefront.v1" ||
    payload.settings?.shopSlug !== SHOP_SLUG ||
    payload.categories.length !== categories.length ||
    payload.featured.length !== 2 ||
    payload.offers.length !== 1 ||
    items.some((item) => item.catalogVersion !== payload.catalogVersion) ||
    /source_product|owner_user|supplier|purchase|stock_quantity|internal|main_path|thumb_path/i.test(
      JSON.stringify(payload),
    )
  ) {
    throw new Error("client_fixture_home_contract_invalid");
  }
  const imageUrls = [...new Set(items.flatMap((item) => Object.values(item.images ?? {}).filter((value) => typeof value === "string" && value.startsWith("https://"))))];
  for (const url of imageUrls) {
    const parsed = new URL(url);
    if (
      parsed.origin !== origin ||
      !parsed.pathname.includes(`/object/public/${PUBLIC_BUCKET}/`) ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("client_fixture_image_url_invalid");
    }
    const response = await fetch(url, { headers: { Range: "bytes=0-31" } });
    if (!response.ok || response.headers.get("content-type") !== "image/webp") {
      throw new Error("client_fixture_public_image_failed");
    }
  }
  const inventory = await anon.from("inventory_products").select("id").limit(1);
  const authoring = await anon
    .from("storefront_product_publications")
    .select("id")
    .limit(1);
  if (!inventory.error || !authoring.error) {
    throw new Error("client_fixture_internal_boundary_failed");
  }
  return {
    apiVersion: payload.apiVersion,
    catalogVersion: payload.catalogVersion,
    categories: payload.categories.length,
    featured: payload.featured.length,
    images: imageUrls.length,
    offers: payload.offers.length,
    ok: true,
    target: "staging",
  };
}

export async function runClientFixture(env = process.env) {
  const target = validateClientFixtureTarget(env);
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY", env);
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", env);
  const client = createClient(target.supabaseOrigin, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "storefront-v1-client-fixture-seed" } },
  });
  const userId = await fixtureUserId(client, target.databaseUrl);
  const assets = await publicAssets(target.supabaseOrigin);
  await uploadAssets(client, assets);
  execFileSync("psql", [target.databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: seedSql(userId, assets),
    stdio: ["pipe", "ignore", "ignore"],
  });
  const result = await verifyPublicContract(target.supabaseOrigin, publishableKey);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/storefront-v1-client-fixture.json",
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  return result;
}

const direct =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  runClientFixture()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "client_fixture_failed");
      process.exitCode = 1;
    });
}
