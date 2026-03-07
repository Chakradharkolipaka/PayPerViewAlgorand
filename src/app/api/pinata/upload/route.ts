import { NextResponse } from "next/server";
import { MAX_VIDEO_SIZE_BYTES } from "@/constants";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      return NextResponse.json(
        { error: "PINATA_JWT is missing on the server" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const name = (form.get("name") as string | null) ?? "";
    const description = (form.get("description") as string | null) ?? "";

    if (!file || !name || !description) {
      return NextResponse.json(
        { error: "Missing file/name/description" },
        { status: 400 }
      );
    }

    // Validate video file type
    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "Only video files are accepted" },
        { status: 400 }
      );
    }

    // Validate file size (3 MB max)
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Video must be under ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    // Upload file to Pinata
    const fileForm = new FormData();
    fileForm.append("file", file);
    fileForm.append("pinataMetadata", JSON.stringify({ name: file.name }));
    fileForm.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const fileRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: fileForm,
    });

    if (!fileRes.ok) {
      const txt = await fileRes.text();
      console.error("API_ERROR", `pinFileToIPFS failed: ${fileRes.status}`, txt);
      return NextResponse.json(
        { error: `File upload failed: ${fileRes.status} ${txt}` },
        { status: 502 }
      );
    }

    const fileJson = await fileRes.json();
    const videoUrl = `https://gateway.pinata.cloud/ipfs/${fileJson.IpfsHash}`;

    // Upload metadata to Pinata (video field instead of image)
    const metaRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: {
          name,
          description,
          video: videoUrl,
          mime_type: file.type || "video/mp4",
        },
        pinataMetadata: { name: `${name}-metadata` },
      }),
    });

    if (!metaRes.ok) {
      const txt = await metaRes.text();
      console.error("API_ERROR", `pinJSONToIPFS failed: ${metaRes.status}`, txt);
      return NextResponse.json(
        { error: `Metadata upload failed: ${metaRes.status} ${txt}` },
        { status: 502 }
      );
    }

    const metaJson = await metaRes.json();
    const tokenURI = `https://gateway.pinata.cloud/ipfs/${metaJson.IpfsHash}`;
    return NextResponse.json({ tokenURI });
  } catch (error) {
    console.error("API_ERROR", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
