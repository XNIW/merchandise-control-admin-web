import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { productDraftFromProduct } from "../../src/lib/product-draft-rebase";

// Render the actual presentational form without loading the app or a backend.
const source = readFileSync(
  "src/app/shop/_components/ProductDetailModalController.tsx",
  "utf8",
);
const start = source.indexOf("function ProductOverviewForm(");
const end = source.indexOf("function ProductArchiveForm(", start);
if (start < 0 || end <= start) throw new Error("ProductOverviewForm anchors changed");
const program = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const fixture = {
  productId: "synthetic-product",
  updatedAt: "2026-10-02T12:00:00.123456Z",
  barcode: "SYNTHETIC-FRACTIONAL-STOCK",
  productName: "Synthetic product",
  itemNumber: "SYNTHETIC-1",
  secondProductName: null,
  categoryName: null,
  supplierName: null,
  purchasePrice: 10,
  retailPrice: 20,
  stockQuantity: 1.25,
};

function formMarkup(stockQuantity: number) {
  const product = { ...fixture, stockQuantity };
  const props = {
    product,
    draft: productDraftFromProduct(product),
    formId: "fractional-stock-form",
    selectedShopId: "synthetic-shop",
    categories: [],
    suppliers: [],
    pending: false,
    onDraftChange: () => {},
  };
  const element = vm.runInNewContext(`${program}\nProductOverviewForm(props)`, {
    React,
    props,
    FormSectionHeader: () => null,
    CreatableCatalogCombobox: () => null,
  });
  return `${renderToStaticMarkup(element)}<button form="fractional-stock-form" type="submit">Save</button>`;
}

test.use({ storageState: { cookies: [], origins: [] }, trace: "off" });

for (const quantity of [1.25, 0.001, 1.234567]) {
  test(`name-only native submit preserves fractional stock ${quantity}`, async ({ page }) => {
    await page.route("**/*", (route) => route.abort());
    await page.setContent(formMarkup(quantity));
    await page.evaluate(() => {
      document.querySelector("form")!.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        form.dataset.submitted = JSON.stringify(Object.fromEntries(new FormData(form)));
      });
    });
    const before = await page.locator("form").evaluate((form) =>
      Object.fromEntries(new FormData(form as HTMLFormElement)),
    );
    await page.locator('[name="productName"]').fill("Renamed product");
    const stock = page.locator('[name="stockQuantity"]');
    await expect(stock).toHaveValue(String(quantity));
    expect(await stock.evaluate((input: HTMLInputElement) => input.validity.stepMismatch)).toBe(false);
    expect(await page.locator("form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(true);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("form")).toHaveAttribute(
      "data-submitted",
      JSON.stringify({ ...before, productName: "Renamed product" }),
    );
  });
}

test("negative stock remains invalid and prevents native submit", async ({ page }) => {
  await page.route("**/*", (route) => route.abort());
  await page.setContent(formMarkup(1.25));
  await page.evaluate(() => {
    document.querySelector("form")!.addEventListener("submit", (event) => {
      event.preventDefault();
      (event.currentTarget as HTMLFormElement).dataset.submitted = "true";
    });
  });
  const stock = page.locator('[name="stockQuantity"]');
  await stock.fill("-0.25");
  expect(await stock.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await page.locator("form").getAttribute("data-submitted")).toBeNull();
});
