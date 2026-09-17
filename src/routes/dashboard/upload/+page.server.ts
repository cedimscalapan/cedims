import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
    // Check if we have a POST request from share-target (PWA interaction)
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const sharedFile = formData.get('shared_file');

            if (sharedFile instanceof File) {
                // SvelteKit Serializer (devalue) doesn't serialize File objects directly.
                // We convert it to a simple metadata object + buffer, 
                // but Svelte will re-hydrate from JS.
                // More robust: use the client-side navigator.setConsumer if possible, 
                // but for Share Target POST, we return a hint.
                return {
                    sharedFile: {
                        name: sharedFile.name,
                        type: sharedFile.type,
                        size: sharedFile.size,
                        lastModified: sharedFile.lastModified,
                        // This is a placeholder since we can't easily pass the binary via devalue
                        // The user will see the filename and we'll ask them to re-confirm 
                        // or use launchQueue (modern) / client-side re-read.
                        isShared: true
                    }
                };
            }
        } catch (e) {
            console.error('[upload] Share target error:', e);
        }
    }

    return {
        sharedFile: null
    };
};
