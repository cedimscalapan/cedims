import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ request }) => {
    // Check if we have a POST request from share-target (PWA interaction)
    if (request.method === 'POST') {
        try {
            const formData = await request.formData();
            const sharedFile = formData.get('shared_file');

            if (sharedFile instanceof File) {
                // devalue (SvelteKit's load-data serializer) can't carry File objects across
                // the server-to-client boundary, so only the metadata below is returned;
                // the actual bytes need a client-side re-read.
                return {
                    sharedFile: {
                        name: sharedFile.name,
                        type: sharedFile.type,
                        size: sharedFile.size,
                        lastModified: sharedFile.lastModified,
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
