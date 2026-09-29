// import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// const MEDIA_MAX_BYTES = 16 * 1024 * 1024;
// const ACCOUNT = "11111111-2222-3333-4444-555555555555";
// const MEDIA_ID = "1234567890123456";

// // mirror-inbound-media.ts uploads through Cloudinary's SDK (migration
// // away from Supabase Storage), so the module itself is mocked rather
// // than an injected `storage` client. `vi.hoisted` lets the mock's
// // `upload` spy be created before vi.mock's factory runs, so tests below
// // can grab it via `cloudinaryUpload` without re-importing the module.
// const { cloudinaryUpload, cloudinaryConfig } = vi.hoisted(() => ({
//   cloudinaryUpload: vi.fn(),
//   cloudinaryConfig: vi.fn(),
// }));

// vi.mock("cloudinary", () => ({
//   v2: {
//     config: cloudinaryConfig,
//     uploader: { upload: cloudinaryUpload },
//   },
// }));

// const {
//   MIRROR_FOLDER,
//   mirrorFileName,
//   mirrorInboundMedia,
//   normalizeMimeType,
// } = await import("./mirror-inbound-media");

// function fakeDownload(bytes: number, contentType = "image/jpeg") {
//   return vi.fn(async () => ({
//     buffer: Buffer.alloc(bytes),
//     contentType,
//   }));
// }

// /** Pulls the MIME type back out of the `data:<mime>;base64,...` URI
//  *  mirrorInboundMedia hands to `cloudinary.uploader.upload`. */
// function uploadedMimeType(call: unknown[]): string {
//   const dataUri = call[0] as string;
//   return dataUri.slice("data:".length, dataUri.indexOf(";base64,"));
// }

// const BASE = {
//   accountId: ACCOUNT,
//   mediaId: MEDIA_ID,
//   downloadUrl: "https://lookaside.fbsbx.com/whatsapp/abc",
//   accessToken: "test-token",
// } as const;

// describe("normalizeMimeType", () => {
//   it("strips parameters and lower-cases", () => {
//     // What Meta actually sends for a voice note.
//     expect(normalizeMimeType("audio/ogg; codecs=opus")).toBe("audio/ogg");
//     expect(normalizeMimeType("IMAGE/JPEG")).toBe("image/jpeg");
//   });

//   it("rejects values that aren't a MIME type", () => {
//     expect(normalizeMimeType(null)).toBeNull();
//     expect(normalizeMimeType("")).toBeNull();
//     expect(normalizeMimeType("binary")).toBeNull();
//   });
// });

// describe("mirrorFileName", () => {
//   it("keeps a document's own name so the download reads sensibly", () => {
//     const name = mirrorFileName({
//       mediaId: MEDIA_ID,
//       mimeType: "application/pdf",
//       fileName: "invoice.pdf",
//     });
//     expect(name).toBe(`${MEDIA_ID}-invoice.pdf`);
//   });

//   it("re-derives the extension from the MIME, not the sender's name", () => {
//     // A sender-controlled ".exe" must not survive into the object path.
//     const name = mirrorFileName({
//       mediaId: MEDIA_ID,
//       mimeType: "application/pdf",
//       fileName: "../../payload.exe",
//     });
//     expect(name).toBe(`${MEDIA_ID}-payload.pdf`);
//   });

//   it("synthesises a stamped name when there is no filename", () => {
//     const name = mirrorFileName({
//       mediaId: MEDIA_ID,
//       mimeType: "image/jpeg",
//       messageTimestamp: "1754899200",
//     });
//     expect(name).toBe(`${MEDIA_ID}-image-1754899200.jpg`);
//   });

//   it("stays under buildMediaPath's 40-char basename cap", () => {
//     // A 19-digit id is the longest Meta realistically issues; if the
//     // synthesised name outgrows the cap, buildMediaPath silently
//     // truncates it and the timestamp stops disambiguating anything.
//     const name = mirrorFileName({
//       mediaId: "1234567890123456789",
//       mimeType: "image/jpeg",
//       messageTimestamp: "1754899200",
//     });
//     expect(name.replace(/\.[^.]+$/, "").length).toBeLessThanOrEqual(40);
//   });

//   it("falls back to a .bin extension for an unknown MIME", () => {
//     const name = mirrorFileName({
//       mediaId: MEDIA_ID,
//       mimeType: "application/x-nonsense",
//       messageTimestamp: "1754899200",
//     });
//     expect(name).toBe(`${MEDIA_ID}-document-1754899200.bin`);
//   });
// });

// describe("mirrorInboundMedia", () => {
//   beforeEach(() => {
//     vi.spyOn(console, "warn").mockImplementation(() => {});
//     cloudinaryUpload.mockReset();
//     cloudinaryUpload.mockResolvedValue({
//       secure_url: "https://res.cloudinary.com/test/mirrored",
//     });
//   });

//   afterEach(() => {
//     vi.restoreAllMocks();
//   });

//   it("uploads to Cloudinary under the account's inbound folder and returns the durable URL", async () => {
//     const download = fakeDownload(1024);

//     const url = await mirrorInboundMedia({
//       ...BASE,
//       mimeType: "image/jpeg",
//       fileSize: 1024,
//       messageTimestamp: "1754899200",
//       download,
//     });

//     expect(cloudinaryUpload).toHaveBeenCalledTimes(1);
//     const [dataUri, options] = cloudinaryUpload.mock.calls[0];
//     expect(uploadedMimeType(cloudinaryUpload.mock.calls[0])).toBe("image/jpeg");
//     expect(dataUri).toMatch(/^data:image\/jpeg;base64,/);
//     expect(options).toMatchObject({
//       folder: `wa-crm/account-${ACCOUNT}/${MIRROR_FOLDER}`,
//       resource_type: "image",
//       overwrite: true,
//     });
//     expect(options.public_id).toContain(MEDIA_ID);
//     expect(url).toBe("https://res.cloudinary.com/test/mirrored");
//   });

//   it("writes the same public_id on a redelivery, so a retry can't orphan a copy", async () => {
//     const args = {
//       ...BASE,
//       mimeType: "image/jpeg" as const,
//       messageTimestamp: "1754899200",
//       download: fakeDownload(1024),
//     };

//     await mirrorInboundMedia(args);
//     await mirrorInboundMedia(args);

//     expect(cloudinaryUpload).toHaveBeenCalledTimes(2);
//     const [, firstOptions] = cloudinaryUpload.mock.calls[0];
//     const [, secondOptions] = cloudinaryUpload.mock.calls[1];
//     expect(firstOptions.public_id).toBe(secondOptions.public_id);
//     expect(firstOptions.folder).toBe(secondOptions.folder);
//     // overwrite, so the second write replaces rather than erroring.
//     expect(secondOptions.overwrite).toBe(true);
//   });

//   it("strips MIME parameters before handing the type to Cloudinary", async () => {
//     // Cloudinary is given the resolved MIME as the data-URI prefix, so
//     // an unstripped `audio/ogg; codecs=opus` would corrupt the upload.
//     await mirrorInboundMedia({
//       ...BASE,
//       mimeType: "audio/ogg; codecs=opus",
//       download: fakeDownload(2048, "audio/ogg; codecs=opus"),
//     });

//     expect(uploadedMimeType(cloudinaryUpload.mock.calls[0])).toBe("audio/ogg");
//     // audio is uploaded as Cloudinary's "video" resource type — there's
//     // no dedicated audio type.
//     expect(cloudinaryUpload.mock.calls[0][1]).toMatchObject({
//       resource_type: "video",
//     });
//   });

//   it("skips oversized media without downloading it", async () => {
//     const download = fakeDownload(1024);

//     const url = await mirrorInboundMedia({
//       ...BASE,
//       mimeType: "application/pdf",
//       fileSize: MEDIA_MAX_BYTES + 1,
//       download,
//     });

//     expect(url).toBeNull();
//     expect(download).not.toHaveBeenCalled();
//     expect(cloudinaryUpload).not.toHaveBeenCalled();
//   });

//   it("skips media that turns out oversized once downloaded", async () => {
//     // Meta's file_size is advisory; the transfer is the truth.
//     const url = await mirrorInboundMedia({
//       ...BASE,
//       mimeType: "video/mp4",
//       fileSize: 1024,
//       download: fakeDownload(MEDIA_MAX_BYTES + 1, "video/mp4"),
//     });

//     expect(url).toBeNull();
//     expect(cloudinaryUpload).not.toHaveBeenCalled();
//   });

//   it("returns null when Cloudinary refuses the upload", async () => {
//     // e.g. a format Cloudinary's account settings reject.
//     cloudinaryUpload.mockRejectedValueOnce(new Error("Invalid image file"));

//     const url = await mirrorInboundMedia({
//       ...BASE,
//       mimeType: "application/x-7z-compressed",
//       download: fakeDownload(1024, "application/x-7z-compressed"),
//     });

//     expect(url).toBeNull();
//   });

//   it("returns null instead of throwing when the download fails", async () => {
//     // The caller is the Meta webhook: a throw here would surface as a
//     // failed delivery and have Meta retry the whole message.
//     const url = await mirrorInboundMedia({
//       ...BASE,
//       mimeType: "image/png",
//       download: vi.fn(async () => {
//         throw new Error("Media download failed: 404");
//       }),
//     });

//     expect(url).toBeNull();
//     expect(cloudinaryUpload).not.toHaveBeenCalled();
//   });

//   it("falls back to the download's content type when Meta gave none", async () => {
//     await mirrorInboundMedia({
//       ...BASE,
//       mimeType: null,
//       download: fakeDownload(1024, "image/png"),
//     });

//     expect(uploadedMimeType(cloudinaryUpload.mock.calls[0])).toBe("image/png");
//   });
// });
