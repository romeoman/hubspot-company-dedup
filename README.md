# HubSpot Company Deduplication

A robust solution for automatically deduplicating companies in HubSpot using Operations Hub workflows.

## Overview

This script provides a complete solution for company deduplication in HubSpot, addressing the common problem of duplicate company records. It intelligently identifies duplicates using multiple properties, merges them following a consistent strategy, and tracks the process using a custom property.

## Features

- **Bidirectional Merging**: Both merges duplicates into primary companies AND pulls duplicates into primary companies
- **Multi-Property Matching**: Uses name plus domain/LinkedIn URLs for accurate duplicate detection
- **Self-Documenting**: Tracks deduplication status using a custom property
- **Primary Preservation**: Always keeps the oldest company record as the primary
- **Detailed Logging**: Comprehensive logging for troubleshooting
- **Error Handling**: Robust error handling with HubSpot's built-in retry mechanism

## Setup Instructions

### 1. Create a Custom Property

First, create a custom property in HubSpot:
- Go to Settings → Properties → Create property
- Object type: Company
- Property name: `deduplication_status`
- Label: "Deduplication Status"
- Field type: Single-line text
- Group: Custom properties

### 2. Create the Workflow

1. Create a new workflow in HubSpot
2. Set it to trigger when companies are:
   - Created, OR
   - Specific properties are updated (like name, domain), OR
   - Manually enrolled
3. Add a "Custom Code" action to your workflow
4. Select "Node.js 20.x" as the language
5. Copy and paste the script code into the editor
6. Add your API token as a secret named "ACCESSTOKEN"
7. Save and activate your workflow

### 3. Recommended Workflow Configuration

For optimal deduplication:

1. **Sequential Processing**: Add multiple instances of the script in sequence:
   - First script action
   - 5-10 second delay
   - Second script action (same code)
   - 5-10 second delay
   - Third script action (optional)

2. **Batch Processing**: When processing large numbers of companies:
   - Process in batches of 100-200 companies at a time
   - Monitor workflow execution to avoid excessive API rate limits

## How It Works

### Deduplication Process

1. **Status Check**: The script first checks the company's `deduplication_status`:
   - If already `merged`, the company is skipped
   - If `primary` or no status, it checks for duplicates

2. **Duplicate Detection**: Finds duplicates using a combination of:
   - Company name matching
   - Plus at least one additional identifier (domain, LinkedIn URL)

3. **Merge Strategy**: 
   - If the current company is the oldest (lowest ID), other duplicates are merged into it
   - If the current company is not the oldest, it's merged into the oldest company

4. **Status Tracking**:
   - Companies that become the main record are marked as `primary`
   - Companies that are merged into others are marked as `merged`

### Matching Properties

The script uses these properties for matching:
- `name`: Primary company name (required)
- `domain`: Company website domain
- `linkedin_company_page`: LinkedIn company page URL
- `sales_navigator_url`: LinkedIn Sales Navigator URL

Additional properties like `country`, `city`, `address`, and `phone` are logged but not used for matching.

## Customization Options

You can customize the script by modifying these constants at the top:

```javascript
// Primary property to use for deduplication
const DEDUPE_PROPERTY = 'name';

// Additional properties to use for deduplication when available
const SECONDARY_PROPERTIES = [
  'domain',
  'linkedin_company_page',
  'sales_navigator_url'
];

// Properties to use for logging and debugging
const LOGGING_PROPERTIES = [
  'country',
  'city',
  'phone',
  'address'
];
```

## Troubleshooting

### Common Issues

1. **API Rate Limits**: If you're processing many companies and hitting rate limits, reduce batch sizes and add delays.
2. **Property Issues**: Ensure the `deduplication_status` property is created correctly and has no validation rules.
3. **Merge Direction**: Companies merge based on ID (lowest/oldest becomes primary), not creation date.

### Debugging

The script provides detailed logging that shows exactly what's happening:
- Which duplicate companies were found
- Which properties matched
- The merge direction
- Success/failure of each operation

Look for log messages with a ✓ symbol to confirm successful operations.

## Credits

This script builds on solutions shared in the [HubSpot Community](https://community.hubspot.com/t5/APIs-Integrations/Custom-code-and-Company-deduplication/m-p/882799) with significant enhancements to handle bidirectional merging and status tracking.

## License

MIT License
