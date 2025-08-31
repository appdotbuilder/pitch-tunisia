import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, facilitiesTable, staffPermissionsTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { 
    createStaffMember,
    updateStaffPermissions,
    getStaffPermissions,
    getFacilityStaff,
    removeStaffMember,
    checkStaffPermission,
    getStaffFacilities
} from '../handlers/staff';

// Test data
const facilityOwner = {
    username: 'facility_owner',
    email: 'owner@example.com',
    password_hash: 'hashed_password',
    full_name: 'Facility Owner',
    phone: '+1234567890',
    role: 'facility_owner' as const,
    is_active: true
};

const staffUser = {
    username: 'staff_member',
    email: 'staff@example.com',
    password_hash: 'hashed_password',
    full_name: 'Staff Member',
    phone: '+1234567891',
    role: 'staff_member' as const,
    is_active: true
};

const testFacility = {
    name: 'Test Sports Center',
    description: 'A test facility',
    address: '123 Test Street',
    city: 'Test City',
    phone: '+1234567890',
    email: 'facility@example.com',
    amenities: ['parking', 'changing_rooms']
};

const testPermissions = ['manage_bookings', 'view_reports', 'update_schedules'];

describe('Staff Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    let ownerId: number;
    let staffId: number;
    let facilityId: number;

    beforeEach(async () => {
        // Create test users
        const ownerResult = await db.insert(usersTable)
            .values(facilityOwner)
            .returning()
            .execute();
        ownerId = ownerResult[0].id;

        const staffResult = await db.insert(usersTable)
            .values(staffUser)
            .returning()
            .execute();
        staffId = staffResult[0].id;

        // Create test facility
        const facilityResult = await db.insert(facilitiesTable)
            .values({
                ...testFacility,
                owner_id: ownerId
            })
            .returning()
            .execute();
        facilityId = facilityResult[0].id;
    });

    describe('createStaffMember', () => {
        it('should create a staff member successfully', async () => {
            const result = await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );

            expect(result.staff_id).toEqual(staffId);
            expect(result.facility_id).toEqual(facilityId);
            expect(result.role_name).toEqual('Manager');
            expect(result.permissions).toEqual(testPermissions);
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
        });

        it('should save staff member to database', async () => {
            const result = await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );

            const dbRecord = await db.select()
                .from(staffPermissionsTable)
                .where(eq(staffPermissionsTable.id, result.id))
                .execute();

            expect(dbRecord).toHaveLength(1);
            expect(dbRecord[0].staff_id).toEqual(staffId);
            expect(dbRecord[0].facility_id).toEqual(facilityId);
            expect(dbRecord[0].role_name).toEqual('Manager');
            expect(dbRecord[0].permissions).toEqual(testPermissions);
        });

        it('should fail when facility does not exist', async () => {
            await expect(createStaffMember(
                ownerId,
                staffId,
                999999, // Non-existent facility
                'Manager',
                testPermissions
            )).rejects.toThrow(/facility not found/i);
        });

        it('should fail when user is not facility owner', async () => {
            // Create another user who is not the owner
            const nonOwnerResult = await db.insert(usersTable)
                .values({
                    ...facilityOwner,
                    username: 'non_owner',
                    email: 'nonowner@example.com'
                })
                .returning()
                .execute();
            const nonOwnerId = nonOwnerResult[0].id;

            await expect(createStaffMember(
                nonOwnerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            )).rejects.toThrow(/only facility owner can add staff members/i);
        });
    });

    describe('updateStaffPermissions', () => {
        let staffPermissionId: number;

        beforeEach(async () => {
            const staffMember = await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );
            staffPermissionId = staffMember.id;
        });

        it('should update staff permissions successfully', async () => {
            const newPermissions = ['manage_bookings', 'view_reports'];
            
            const result = await updateStaffPermissions(
                staffPermissionId,
                newPermissions,
                ownerId
            );

            expect(result.permissions).toEqual(newPermissions);
            expect(result.updated_at).toBeInstanceOf(Date);
        });

        it('should fail when staff permission record does not exist', async () => {
            await expect(updateStaffPermissions(
                999999, // Non-existent ID
                ['test'],
                ownerId
            )).rejects.toThrow(/staff permission record not found/i);
        });

        it('should fail when user is not facility owner', async () => {
            // Create another user who is not the owner
            const nonOwnerResult = await db.insert(usersTable)
                .values({
                    ...facilityOwner,
                    username: 'non_owner',
                    email: 'nonowner@example.com'
                })
                .returning()
                .execute();
            const nonOwnerId = nonOwnerResult[0].id;

            await expect(updateStaffPermissions(
                staffPermissionId,
                ['test'],
                nonOwnerId
            )).rejects.toThrow(/only facility owner can update staff permissions/i);
        });
    });

    describe('getStaffPermissions', () => {
        beforeEach(async () => {
            await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );
        });

        it('should get staff permissions successfully', async () => {
            const result = await getStaffPermissions(staffId, facilityId);

            expect(result).not.toBeNull();
            expect(result!.staff_id).toEqual(staffId);
            expect(result!.facility_id).toEqual(facilityId);
            expect(result!.permissions).toEqual(testPermissions);
        });

        it('should return null when staff permission does not exist', async () => {
            const result = await getStaffPermissions(999999, facilityId);
            expect(result).toBeNull();
        });
    });

    describe('getFacilityStaff', () => {
        beforeEach(async () => {
            await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );
        });

        it('should get all facility staff successfully', async () => {
            const result = await getFacilityStaff(facilityId, ownerId);

            expect(result).toHaveLength(1);
            expect(result[0].staff_id).toEqual(staffId);
            expect(result[0].facility_id).toEqual(facilityId);
            expect(result[0].role_name).toEqual('Manager');
        });

        it('should fail when facility does not exist', async () => {
            await expect(getFacilityStaff(
                999999, // Non-existent facility
                ownerId
            )).rejects.toThrow(/facility not found/i);
        });

        it('should fail when user is not facility owner', async () => {
            // Create another user who is not the owner
            const nonOwnerResult = await db.insert(usersTable)
                .values({
                    ...facilityOwner,
                    username: 'non_owner',
                    email: 'nonowner@example.com'
                })
                .returning()
                .execute();
            const nonOwnerId = nonOwnerResult[0].id;

            await expect(getFacilityStaff(
                facilityId,
                nonOwnerId
            )).rejects.toThrow(/only facility owner can view staff list/i);
        });
    });

    describe('removeStaffMember', () => {
        let staffPermissionId: number;

        beforeEach(async () => {
            const staffMember = await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );
            staffPermissionId = staffMember.id;
        });

        it('should remove staff member successfully', async () => {
            await removeStaffMember(staffPermissionId, ownerId);

            // Verify staff member was removed
            const result = await db.select()
                .from(staffPermissionsTable)
                .where(eq(staffPermissionsTable.id, staffPermissionId))
                .execute();

            expect(result).toHaveLength(0);
        });

        it('should fail when staff permission record does not exist', async () => {
            await expect(removeStaffMember(
                999999, // Non-existent ID
                ownerId
            )).rejects.toThrow(/staff permission record not found/i);
        });

        it('should fail when user is not facility owner', async () => {
            // Create another user who is not the owner
            const nonOwnerResult = await db.insert(usersTable)
                .values({
                    ...facilityOwner,
                    username: 'non_owner',
                    email: 'nonowner@example.com'
                })
                .returning()
                .execute();
            const nonOwnerId = nonOwnerResult[0].id;

            await expect(removeStaffMember(
                staffPermissionId,
                nonOwnerId
            )).rejects.toThrow(/only facility owner can remove staff members/i);
        });
    });

    describe('checkStaffPermission', () => {
        beforeEach(async () => {
            await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );
        });

        it('should return true when staff has required permission', async () => {
            const result = await checkStaffPermission(
                staffId,
                facilityId,
                'manage_bookings'
            );

            expect(result).toBe(true);
        });

        it('should return false when staff does not have required permission', async () => {
            const result = await checkStaffPermission(
                staffId,
                facilityId,
                'admin_access'
            );

            expect(result).toBe(false);
        });

        it('should return false when staff permission record does not exist', async () => {
            const result = await checkStaffPermission(
                999999, // Non-existent staff
                facilityId,
                'manage_bookings'
            );

            expect(result).toBe(false);
        });
    });

    describe('getStaffFacilities', () => {
        beforeEach(async () => {
            await createStaffMember(
                ownerId,
                staffId,
                facilityId,
                'Manager',
                testPermissions
            );
        });

        it('should get staff facilities successfully', async () => {
            const result = await getStaffFacilities(staffId);

            expect(result).toHaveLength(1);
            expect(result[0].facilityId).toEqual(facilityId);
            expect(result[0].facilityName).toEqual('Test Sports Center');
            expect(result[0].roleName).toEqual('Manager');
            expect(result[0].permissions).toEqual(testPermissions);
        });

        it('should return empty array when staff has no facilities', async () => {
            // Create a new staff member with no assigned facilities
            const newStaffResult = await db.insert(usersTable)
                .values({
                    ...staffUser,
                    username: 'new_staff',
                    email: 'newstaff@example.com'
                })
                .returning()
                .execute();

            const result = await getStaffFacilities(newStaffResult[0].id);
            expect(result).toHaveLength(0);
        });

        it('should handle multiple facilities for same staff member', async () => {
            // Create another facility for the same owner
            const facility2Result = await db.insert(facilitiesTable)
                .values({
                    ...testFacility,
                    name: 'Test Sports Center 2',
                    owner_id: ownerId
                })
                .returning()
                .execute();

            // Add staff to second facility with different role
            await createStaffMember(
                ownerId,
                staffId,
                facility2Result[0].id,
                'Assistant',
                ['view_reports']
            );

            const result = await getStaffFacilities(staffId);

            expect(result).toHaveLength(2);
            
            const facility1 = result.find(f => f.facilityName === 'Test Sports Center');
            const facility2 = result.find(f => f.facilityName === 'Test Sports Center 2');
            
            expect(facility1).toBeDefined();
            expect(facility1!.roleName).toEqual('Manager');
            expect(facility1!.permissions).toEqual(testPermissions);
            
            expect(facility2).toBeDefined();
            expect(facility2!.roleName).toEqual('Assistant');
            expect(facility2!.permissions).toEqual(['view_reports']);
        });
    });
});