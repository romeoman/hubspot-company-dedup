# HubSpot Company Deduplication

A custom code solution for automatically deduplicating companies in HubSpot using Operations Hub workflows.

## Overview

This script helps solve the common problem of duplicate companies in HubSpot. When integrated into a workflow, it will:

1. Search for other companies with the same name
2. Analyze matches to determine the best deduplication strategy
3. Merge companies intelligently to maintain data integrity
4. Provide detailed logging and output fields for workflow branching

## Features

- **Smart Deduplication**: Automatically detects and merges duplicate companies
- **Intelligent Handling**: Uses strategies to handle multiple potential matches
- **Flexible Configuration**: Easily change the property used for matching (name, domain, etc.)
- **Detailed Logging**: Comprehensive logging for troubleshooting
- **Output Fields**: Returns useful information to the workflow for branching logic

## Installation

### Prerequisites

- HubSpot Operations Hub (Professional or Enterprise tier)
- Access to create and edit workflows
- HubSpot API access token

### Setup Instructions

1. Create a new workflow in HubSpot
2. Add a "Custom Code" action to your workflow
3. Select "Node.js 20.x" as the language
4. Copy and paste the script code into the editor
5. Add your API token as a secret named "ACCESSTOKEN"
6. Save and activate your workflow

## Configuration Options

The script can be customized by modifying these constants at the top:

```javascript
const DEDUPE_PROPERTY = 'name'; // The property to use for deduplication
const SECONDARY_PROPERTIES = ['domain', 'phone', 'address']; // Additional properties to log
```

### Deduplication Properties

You can set `DEDUPE_PROPERTY` to any company property you want to use for matching:

- `name` - Match by company name (default)
- `domain` - Match by website domain
- `phone` - Match by phone number
- Or any other unique company property

## How It Works

1. **Trigger**: A company is enrolled in the workflow
2. **Property Check**: The script gets the company's name (or other property)
3. **Search**: It searches for other companies with the same property value
4. **Analysis**: It analyzes the results:
   - If no matches are found, nothing happens
   - If one match is found, companies are merged
   - If multiple matches are found, the oldest company (lowest ID) is chosen as primary
5. **Merge**: The enrolled company is merged into the primary company
6. **Output**: Results are provided as output fields for workflow branching

## Merge Behavior

When companies are merged:

- The primary company (usually the one with the lowest ID) retains its record
- The secondary company's data is merged into the primary
- If there are property conflicts, HubSpot's default property resolution applies
- Associated records (contacts, deals, tickets) are moved to the primary company

## Output Fields

The script provides these output fields for workflow branching:

- `result`: Status of the operation ('Success', 'No duplicates found', 'Multiple matches resolved', 'Error')
- `primaryCompanyId`: ID of the company that was kept as primary (if applicable)
- `mergedCompanyIds`: List of IDs that were merged (if multiple matches)
- `error`: Error message (if an error occurred)

## Logging Examples

### No Matches Found
```
Looking for duplicates based on name = Example Corp
Company domain: example.com
No matching companies found, nothing to merge
```

### Single Match
```
Looking for duplicates based on name = Example Corp
Company domain: example.com
Merging enrolled company id=12345 into company id=67890
Companies merged successfully!
```

### Multiple Matches
```
Looking for duplicates based on name = ACCA software
Company domain: acca.it
Company address: Bagnoli Irpino, AV
Found multiple potential company IDs: 32059092526, 32137260888
Handling multiple matches by selecting the oldest company (lowest ID)
Strategy: Using oldest company (ID: 32059092526) as the primary record
Will merge current company (ID: 32024273493) and others into this primary company
Successfully merged current company (ID: 32024273493) into primary (ID: 32059092526)
```

## Troubleshooting

### Common Issues

1. **API Permission Errors**: Ensure your access token has proper permissions.
2. **No Deduplication Occurring**: Check that the `DEDUPE_PROPERTY` exists and has values.
3. **Workflow Not Enrolling**: Verify your workflow enrollment triggers.

### Debugging

Enable additional logging by uncommenting this line:
```javascript
// console.log('All company properties:', JSON.stringify(companyResult.properties, null, 2));
```

## Credits

This script is based on solutions shared in the [HubSpot Community](https://community.hubspot.com/t5/APIs-Integrations/Custom-code-and-Company-deduplication/m-p/882799).

## License

MIT License
