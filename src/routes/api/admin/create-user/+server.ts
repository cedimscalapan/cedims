import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { supabase } from '$lib/utils/supabase';

export async function POST({ request }) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) throw error(401, 'Unauthorized');

        const token = authHeader.replace('Bearer ', '');
        const { data: { user: requester }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !requester) throw error(401, 'Unauthorized');

        const body = await request.json();
        const { email, password, fullName, role, schoolId, districtId } = body;

        if (!email || !password || !fullName || !role) {
            throw error(400, 'Missing required fields: email, password, fullName, role');
        }

        const validRoles = ['Teacher', 'School Head', 'Master Teacher', 'District Supervisor'];
        if (!validRoles.includes(role)) {
            throw error(400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
        }

        if (password.length < 6) {
            throw error(400, 'Password must be at least 6 characters');
        }

        const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            throw error(500, 'Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY');
        }

        const supabaseAdmin = createClient(
            publicEnv.PUBLIC_SUPABASE_URL,
            serviceRoleKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data: adminProfile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', requester.id)
            .single();

        if (!adminProfile || (adminProfile.role !== 'District Supervisor' && adminProfile.role !== 'Admin')) {
            throw error(403, 'Only District Supervisors and Admins can create users.');
        }

        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role,
                school_id: schoolId || '',
                district_id: districtId || ''
            }
        });

        if (createError) {
            throw error(400, `Failed to create user: ${createError.message}`);
        }

        if (!newUser.user) {
            throw error(500, 'User created but no user object returned');
        }

        return json({
            success: true,
            user: {
                id: newUser.user.id,
                email,
                fullName,
                role,
                schoolId: schoolId || null,
                districtId: districtId || null
            }
        });
    } catch (err: any) {
        console.error('[create-user] Unhandled error:', err?.stack || err?.message || err);
        if (err?.status && err?.body) throw err;
        throw error(500, err?.message || 'Internal server error');
    }
}
