const API_ORIGIN =
    "http://ec2-13-235-79-157.ap-south-1.compute.amazonaws.com:5000";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const target = API_ORIGIN + url.pathname + url.search;

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders,
            });
        }

        try {
            const headers = new Headers(request.headers);
            headers.delete("host");

            const response = await fetch(target, {
                method: request.method,
                headers,
                body:
                    request.method !== "GET" && request.method !== "HEAD"
                        ? request.body
                        : undefined,
            });

            const newResponse = new Response(response.body, response);
            Object.entries(corsHeaders).forEach(([key, value]) => {
                newResponse.headers.set(key, value);
            });
            return newResponse;
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders,
                },
            });
        }
    },
};
