import { pool } from "./db";

interface IdentifyInput {
  email?: string;
  phoneNumber?: string;
}

interface Contact {
  id: number;
  email: string | null;
  phonenumber: string | null;
  linkedid: number | null;
  linkprecedence: "primary" | "secondary";
  createdat: Date;
  updatedat: Date;
  deletedat: Date | null;
}

export const identifyService = async (input: IdentifyInput) => {
  const email = input.email ?? null;
  const phoneNumber =
  input.phoneNumber !== undefined && input.phoneNumber !== null
    ? input.phoneNumber.toString()
    : null;

  console.log("\n================ NEW IDENTIFY REQUEST ================");
  console.log("Incoming Input:", { email, phoneNumber });

  if (!email && !phoneNumber) {
    const error: any = new Error(
      "Either email or phoneNumber must be provided"
    );
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    console.log("Transaction started");

    
    const matchQuery = `
      SELECT * FROM Contact
      WHERE deletedAt IS NULL
      AND (
        email=$1
        OR
        phonenumber=$2
      )
    `;

    const { rows: matchedContacts } =
      await client.query<Contact>(matchQuery, [email, phoneNumber]);

    console.log("Matched Contacts:", matchedContacts);

    
    if (matchedContacts.length === 0) {
      console.log("No existing contact found. Creating new primary.");

      const insertQuery = `
        INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence)
        VALUES ($1, $2, NULL, 'primary')
        RETURNING *
      `;

      const { rows } = await client.query<Contact>(insertQuery, [
        email,
        phoneNumber,
      ]);

      await client.query("COMMIT");
      console.log("Transaction committed (new primary created).");

      return {
        contact: {
          primaryContactId: rows[0].id,
          emails: email ? [email] : [],
          phoneNumbers: phoneNumber ? [phoneNumber] : [],
          secondaryContactIds: [],
        },
      };
    }

    
    const rootIds = new Set<number>();
    matchedContacts.forEach((c: Contact) => {
      rootIds.add(c.linkedid ?? c.id);
    });

    console.log("Resolved Root IDs:", [...rootIds]);

    const { rows: rootContacts } = await client.query<Contact>(
      `SELECT * FROM Contact WHERE id = ANY($1)`,
      [[...rootIds]]
    );

    
    rootContacts.sort(
      (a: Contact, b: Contact) =>
        new Date(a.createdat).getTime() -
        new Date(b.createdat).getTime()
    );

    const truePrimary = rootContacts[0];
    console.log("True Primary Selected:", truePrimary.id);

    
    if (rootIds.size > 1) {
      console.log("Multiple roots detected. Merging clusters...");

      for (let i = 1; i < rootContacts.length; i++) {
        const oldRoot = rootContacts[i];

        console.log(`Merging root ${oldRoot.id} into ${truePrimary.id}`);

        await client.query(
          `
          UPDATE Contact
          SET linkedId = $1,
              linkPrecedence = 'secondary',
              updatedAt = NOW()
          WHERE id = $2
        `,
          [truePrimary.id, oldRoot.id]
        );

        await client.query(
          `
          UPDATE Contact
          SET linkedId = $1,
              updatedAt = NOW()
          WHERE linkedId = $2
        `,
          [truePrimary.id, oldRoot.id]
        );
      }
    } else {
      console.log("All matches already belong to same root. No merge needed.");
    }

    
    let { rows: cluster } = await client.query<Contact>(
      `
      SELECT * FROM Contact
      WHERE deletedAt IS NULL
      AND (id = $1 OR linkedId = $1)
    `,
      [truePrimary.id]
    );

    console.log("Cluster after merge:", cluster.map(c => c.id));

    
    const emailExists = email
      ? cluster.some((c: Contact) => c.email === email)
      : true;

    const phoneExists = phoneNumber
      ? cluster.some((c: Contact) => c.phonenumber === phoneNumber)
      : true;

    console.log("Email exists in cluster?", emailExists);
    console.log("Phone exists in cluster?", phoneExists);

    if (!emailExists || !phoneExists) {
      console.log("New information detected. Creating secondary contact.");

      await client.query(
        `
        INSERT INTO Contact (email, phoneNumber, linkedId, linkPrecedence)
        VALUES ($1, $2, $3, 'secondary')
      `,
        [email, phoneNumber, truePrimary.id]
      );

      const updated = await client.query<Contact>(
        `
        SELECT * FROM Contact
        WHERE deletedAt IS NULL
        AND (id = $1 OR linkedId = $1)
      `,
        [truePrimary.id]
      );

      cluster = updated.rows;
      console.log("Cluster after secondary insert:", cluster.map(c => c.id));
    }

    await client.query("COMMIT");
    console.log("Transaction committed successfully.");
    console.log("=====================================================\n");

    return buildResponse(truePrimary.id, cluster);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Transaction rolled back due to error:", err);
    throw err;
  } finally {
    client.release();
  }
};

function buildResponse(primaryId: number, cluster: Contact[]) {
  const primary = cluster.find((c) => c.id === primaryId)!;

  const emails = [
    primary.email,
    ...cluster
      .filter((c) => c.id !== primaryId)
      .map((c) => c.email),
  ].filter(Boolean) as string[];

  const phoneNumbers = [
    primary.phonenumber,
    ...cluster
      .filter((c) => c.id !== primaryId)
      .map((c) => c.phonenumber),
  ].filter(Boolean) as string[];

  return {
    contact: {
      primaryContactId: primaryId,
      emails: [...new Set(emails)],
      phoneNumbers: [...new Set(phoneNumbers)],
      secondaryContactIds: cluster
        .filter((c) => c.id !== primaryId)
        .map((c) => c.id),
    },
  };
}