# Hygraph Schema Migration

## Step 1: Add New Fields to User Model

1. Login to Hygraph CMS
2. Navigate to Schema → Models → User
3. Add the following fields:

### Field 1: shop_enabled
- Type: Boolean
- Display Name: Shop Enabled
- API ID: `shop_enabled`
- Default value: `true`
- Required: Yes

### Field 2: fantasy_enabled
- Type: Boolean  
- Display Name: Fantasy Enabled
- API ID: `fantasy_enabled`
- Default value: `true`
- Required: Yes

### Field 3: modules
- Type: String (Allow multiple values)
- Display Name: Modules
- API ID: `modules`
- Default values: `["shop", "fantasy"]`
- Required: Yes

### Field 4: fantasy_user_id
- Type: String
- Display Name: Fantasy User ID
- API ID: `fantasy_user_id`
- Required: No

## Step 2: Update Existing Users

Run this GraphQL mutation in Hygraph API Playground:

```graphql
mutation UpdateExistingUsers {
  updateManyUsers(
    where: { id_not: "" }
    data: {
      shop_enabled: true
      fantasy_enabled: true
      modules: ["shop", "fantasy"]
    }
  ) {
    count
  }
}
```

## Step 3: Publish Changes

Click "Publish" to make schema changes live.

## Notes
- These schema updates must be done manually in Hygraph CMS dashboard
- The backend code expects these fields to be present
- If fields are not present, module validation will not work correctly
- fantasy_user_id will be automatically populated when users log in
