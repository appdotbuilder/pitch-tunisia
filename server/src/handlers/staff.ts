import { db } from '../db';
import { staffPermissionsTable, facilitiesTable } from '../db/schema';
import { type StaffPermission } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createStaffMember(
    facilityOwnerId: number,
    staffUserId: number,
    facilityId: number,
    roleName: string,
    permissions: string[]
): Promise<StaffPermission> {
    try {
        // Verify that the facility owner actually owns the facility
        const facility = await db.select()
            .from(facilitiesTable)
            .where(eq(facilitiesTable.id, facilityId))
            .execute();

        if (facility.length === 0) {
            throw new Error('Facility not found');
        }

        if (facility[0].owner_id !== facilityOwnerId) {
            throw new Error('Only facility owner can add staff members');
        }

        // Create staff permission record
        const result = await db.insert(staffPermissionsTable)
            .values({
                staff_id: staffUserId,
                facility_id: facilityId,
                role_name: roleName,
                permissions: permissions
            })
            .returning()
            .execute();

        const staffPermission = result[0];
        return {
            ...staffPermission,
            permissions: staffPermission.permissions as string[]
        };
    } catch (error) {
        console.error('Staff member creation failed:', error);
        throw error;
    }
}

export async function updateStaffPermissions(
    staffPermissionId: number,
    permissions: string[],
    ownerId: number
): Promise<StaffPermission> {
    try {
        // Get the staff permission record to verify ownership
        const staffPermissions = await db.select({
            staff_permission: staffPermissionsTable,
            facility: facilitiesTable
        })
            .from(staffPermissionsTable)
            .innerJoin(facilitiesTable, eq(staffPermissionsTable.facility_id, facilitiesTable.id))
            .where(eq(staffPermissionsTable.id, staffPermissionId))
            .execute();

        if (staffPermissions.length === 0) {
            throw new Error('Staff permission record not found');
        }

        if (staffPermissions[0].facility.owner_id !== ownerId) {
            throw new Error('Only facility owner can update staff permissions');
        }

        // Update permissions
        const result = await db.update(staffPermissionsTable)
            .set({
                permissions: permissions,
                updated_at: new Date()
            })
            .where(eq(staffPermissionsTable.id, staffPermissionId))
            .returning()
            .execute();

        const staffPermission = result[0];
        return {
            ...staffPermission,
            permissions: staffPermission.permissions as string[]
        };
    } catch (error) {
        console.error('Staff permissions update failed:', error);
        throw error;
    }
}

export async function getStaffPermissions(staffId: number, facilityId: number): Promise<StaffPermission | null> {
    try {
        const result = await db.select()
            .from(staffPermissionsTable)
            .where(
                and(
                    eq(staffPermissionsTable.staff_id, staffId),
                    eq(staffPermissionsTable.facility_id, facilityId)
                )
            )
            .execute();

        if (result.length === 0) return null;
        
        const staffPermission = result[0];
        return {
            ...staffPermission,
            permissions: staffPermission.permissions as string[]
        };
    } catch (error) {
        console.error('Get staff permissions failed:', error);
        throw error;
    }
}

export async function getFacilityStaff(facilityId: number, ownerId: number): Promise<StaffPermission[]> {
    try {
        // Verify facility ownership first
        const facility = await db.select()
            .from(facilitiesTable)
            .where(eq(facilitiesTable.id, facilityId))
            .execute();

        if (facility.length === 0) {
            throw new Error('Facility not found');
        }

        if (facility[0].owner_id !== ownerId) {
            throw new Error('Only facility owner can view staff list');
        }

        // Get all staff for the facility
        const result = await db.select()
            .from(staffPermissionsTable)
            .where(eq(staffPermissionsTable.facility_id, facilityId))
            .execute();

        return result.map(staffPermission => ({
            ...staffPermission,
            permissions: staffPermission.permissions as string[]
        }));
    } catch (error) {
        console.error('Get facility staff failed:', error);
        throw error;
    }
}

export async function removeStaffMember(
    staffPermissionId: number,
    ownerId: number
): Promise<void> {
    try {
        // Get the staff permission record to verify ownership
        const staffPermissions = await db.select({
            staff_permission: staffPermissionsTable,
            facility: facilitiesTable
        })
            .from(staffPermissionsTable)
            .innerJoin(facilitiesTable, eq(staffPermissionsTable.facility_id, facilitiesTable.id))
            .where(eq(staffPermissionsTable.id, staffPermissionId))
            .execute();

        if (staffPermissions.length === 0) {
            throw new Error('Staff permission record not found');
        }

        if (staffPermissions[0].facility.owner_id !== ownerId) {
            throw new Error('Only facility owner can remove staff members');
        }

        // Remove staff permission record
        await db.delete(staffPermissionsTable)
            .where(eq(staffPermissionsTable.id, staffPermissionId))
            .execute();
    } catch (error) {
        console.error('Staff member removal failed:', error);
        throw error;
    }
}

export async function checkStaffPermission(
    staffId: number,
    facilityId: number,
    requiredPermission: string
): Promise<boolean> {
    try {
        const staffPermissions = await db.select()
            .from(staffPermissionsTable)
            .where(
                and(
                    eq(staffPermissionsTable.staff_id, staffId),
                    eq(staffPermissionsTable.facility_id, facilityId)
                )
            )
            .execute();

        if (staffPermissions.length === 0) {
            return false;
        }

        const permissions = staffPermissions[0].permissions as string[];
        return permissions.includes(requiredPermission);
    } catch (error) {
        console.error('Check staff permission failed:', error);
        throw error;
    }
}

export async function getStaffFacilities(staffId: number): Promise<{
    facilityId: number;
    facilityName: string;
    roleName: string;
    permissions: string[];
}[]> {
    try {
        const result = await db.select({
            staff_permission: staffPermissionsTable,
            facility: facilitiesTable
        })
            .from(staffPermissionsTable)
            .innerJoin(facilitiesTable, eq(staffPermissionsTable.facility_id, facilitiesTable.id))
            .where(eq(staffPermissionsTable.staff_id, staffId))
            .execute();

        return result.map(row => ({
            facilityId: row.facility.id,
            facilityName: row.facility.name,
            roleName: row.staff_permission.role_name,
            permissions: row.staff_permission.permissions as string[]
        }));
    } catch (error) {
        console.error('Get staff facilities failed:', error);
        throw error;
    }
}