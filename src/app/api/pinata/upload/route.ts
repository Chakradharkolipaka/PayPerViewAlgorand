import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  console.log("API route called");
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    console.error("PINATA_JWT not found in environment variables");
    return NextResponse.json({ error: "Missing PINATA_JWT" }, { status: 500 });
  }

  console.log("JWT found, parsing form data...");
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const name = (form.get("name") as string | null) ?? "";
  const description = (form.get("description") as string | null) ?? "";

  console.log("Form data:", { fileName: file?.name, name, description });

  if (!file || !name || !description) {
    console.error("Missing required fields");
    return NextResponse.json({ error: "Missing file/name/description" }, { status: 400 });
  }

  try {
    console.log("Uploading file to Pinata...");
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

    console.log("File upload response status:", fileRes.status);

    if (!fileRes.ok) {
      const txt = await fileRes.text();
      console.error("File upload failed:", txt);
      return NextResponse.json(
        { error: `File upload failed: ${fileRes.status} ${txt}` },
        { status: 502 }
      );
    }

    const fileJson = await fileRes.json();
    console.log("File uploaded, hash:", fileJson.IpfsHash);
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${fileJson.IpfsHash}`;

    console.log("Uploading metadata to Pinata...");
    // Upload metadata to Pinata
    const metaRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: { name, description, image: imageUrl },
        pinataMetadata: { name: `${name}-metadata` },
      }),
    });

    console.log("Metadata upload response status:", metaRes.status);

    if (!metaRes.ok) {
      const txt = await metaRes.text();
      console.error("Metadata upload failed:", txt);
      return NextResponse.json(
        { error: `Metadata upload failed: ${metaRes.status} ${txt}` },
        { status: 502 }
      );
    }

    const metaJson = await metaRes.json();
    console.log("Metadata uploaded, hash:", metaJson.IpfsHash);
    const tokenURI = `https://gateway.pinata.cloud/ipfs/${metaJson.IpfsHash}`;

    console.log("Upload successful, returning tokenURI:", tokenURI);
    return NextResponse.json({ tokenURI });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
