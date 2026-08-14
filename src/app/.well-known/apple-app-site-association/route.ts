const association = {
  applinks: {
    details: [
      {
        appIDs: ["45PJ364B5B.com.niwcyber.iOSMerchandiseControl"],
        components: [
          {
            "/": "/wechat/ios/",
            comment: "Exact MerchandiseControl staging WeChat iOS return path.",
          },
          {
            "/": "/wechat/ios/*",
            comment: "Nested MerchandiseControl staging WeChat iOS return paths.",
          },
        ],
      },
    ],
  },
} as const;

export function GET() {
  return Response.json(association, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
