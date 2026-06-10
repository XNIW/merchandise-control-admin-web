"use client";

export async function submitPlatformProvisioningForm(
  url: string,
  body: FormData,
) {
  // same-origin cookie session is the source of truth. The server revalidates
  // the user and Platform Admin grant before any RPC receives an actor JWT.
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  return window.fetch(url, {
    body,
    credentials: "same-origin",
    headers,
    method: "POST",
  });
}
