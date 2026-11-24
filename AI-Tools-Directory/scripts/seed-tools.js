import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
}

const toolsPath = new URL("../data/tools.json", import.meta.url);
const toolsByCategory = JSON.parse(await readFile(toolsPath, "utf8"));
const rows = Object.entries(toolsByCategory).flatMap(([category, tools]) =>
    tools.map((tool, position) => ({
        category,
        name: tool.name,
        description: tool.desc,
        url: tool.url,
        pricing: tool.pricing,
        domain: tool.domain,
        position
    }))
);

if (!rows.length) {
    throw new Error("No tool records found in data/tools.json.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const { error } = await supabase
        .from("tools")
        .upsert(batch, { onConflict: "category,name" });
    if (error) throw error;
}

console.log(`Imported ${rows.length} tools across ${Object.keys(toolsByCategory).length} categories.`);
