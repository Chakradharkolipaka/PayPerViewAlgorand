interface Metadata {
  name: string;
  description: string;
  image: string;
}

export async function uploadToIPFS(file: File, name: string, description: string): Promise<string> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;

  if (!jwt) {
    console.error("Missing NEXT_PUBLIC_PINATA_JWT env var");
    throw new Error("Pinata JWT is not configured");
  }

  try {
    // 1. Upload the image file using FormData
    const formData = new FormData();
    formData.append("file", file);

    const pinataMetadata = JSON.stringify({ name: file.name });
    formData.append("pinataMetadata", pinataMetadata);

    const pinataOptions = JSON.stringify({ cidVersion: 1 });
    formData.append("pinataOptions", pinataOptions);

    const fileRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });

    if (!fileRes.ok) {
      const errorText = await fileRes.text();
      console.error("Pinata file upload failed", fileRes.status, errorText);
      throw new Error("Failed to upload file to IPFS");
    }

    const fileJson = await fileRes.json();
    const imageUrl = `https://gateway.pinata.cloud/ipfs/${fileJson.IpfsHash}`;

    // 2. Upload the metadata JSON
    const metadata: Metadata = {
      name,
      description,
      image: imageUrl,
    };

    const jsonRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: { name: `${name}-metadata` },
      }),
    });

    if (!jsonRes.ok) {
      const errorText = await jsonRes.text();
      console.error("Pinata metadata upload failed", jsonRes.status, errorText);
      throw new Error("Failed to upload metadata to IPFS");
    }

    const jsonData = await jsonRes.json();
    const jsonUrl = `https://gateway.pinata.cloud/ipfs/${jsonData.IpfsHash}`;

    return jsonUrl;
  } catch (error) {
    console.error("Error uploading to IPFS:", error);
    throw new Error("Failed to upload to IPFS");
  }
}
