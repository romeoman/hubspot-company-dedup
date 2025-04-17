/**
 * Company Deduplication Script for HubSpot Operations Hub (Final Version)
 * 
 * This script searches for companies with the same identifying properties and deduplicates them.
 * Enhanced to handle multiple duplicate companies by tracking merged companies in a custom property.
 * 
 * Based on community solutions: https://community.hubspot.com/t5/APIs-Integrations/Custom-code-and-Company-deduplication/m-p/882799
 */

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

// Custom property to store deduplication status (needs to be created in HubSpot)
const DEDUPLICATION_STATUS_PROPERTY = 'deduplication_status';

// All properties to fetch from the API
const ALL_PROPERTIES = [
  DEDUPE_PROPERTY,
  ...SECONDARY_PROPERTIES,
  ...LOGGING_PROPERTIES,
  DEDUPLICATION_STATUS_PROPERTY
];

const hubspot = require('@hubspot/api-client');

// Verify if the module was loaded correctly
console.log(`HubSpot API client loaded: ${typeof hubspot === 'object' ? 'Yes' : 'No'}`);

exports.main = (event, callback) => {
  // Log the event info
  console.log(`Processing company ID: ${event.object.objectId}`);
  
  // Initialize the HubSpot client with the access token from secrets
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.ACCESSTOKEN
  });
  
  console.log(`HubSpot client initialized with token: ${process.env.ACCESSTOKEN ? 'Yes (token hidden)' : 'No token found'}`);
  
  // Step 1: Get the current company details
  hubspotClient.crm.companies.basicApi
    .getById(event.object.objectId, ALL_PROPERTIES)
    .then(companyResult => {
      // Get the deduplication status
      const deduplicationStatus = companyResult.properties[DEDUPLICATION_STATUS_PROPERTY];
      
      // Only skip if the status is 'merged' - allow 'primary' companies to be checked again
      if (deduplicationStatus === 'merged') {
        console.log(`This company has already been merged into another (status: ${deduplicationStatus})`);
        callback({
          outputFields: {
            result: `Already merged into another company`,
            companyId: event.object.objectId
          }
        });
        return;
      }
      
      // Log current status
      console.log(`Deduplication status: ${deduplicationStatus || 'not set'}`);
      if (deduplicationStatus === 'primary') {
        console.log(`This company was previously marked as primary, but will check for new duplicates`);
      }
      
      // Step 2: Extract the dedupe property values
      const dedupePropValue = companyResult.properties[DEDUPE_PROPERTY];
      
      // Log the main dedupe property and additional info for debugging
      console.log(`Looking for duplicates based on ${DEDUPE_PROPERTY} = ${dedupePropValue}`);
      
      // Log secondary properties for better debugging
      for (const prop of [...SECONDARY_PROPERTIES, ...LOGGING_PROPERTIES]) {
        if (companyResult.properties[prop]) {
          console.log(`Company ${prop}: ${companyResult.properties[prop]}`);
        }
      }
      
      // Step 3: Build the search criteria for finding duplicates
      // Using strict matching to prevent accidental merges
      const filterGroups = [];
      
      if (dedupePropValue) {
        // Base name filter
        const nameFilter = {
          propertyName: DEDUPE_PROPERTY,
          operator: 'EQ',
          value: dedupePropValue
        };
        
        // Get secondary identifiers
        const secondaryFilters = [];
        for (const prop of SECONDARY_PROPERTIES) {
          const propValue = companyResult.properties[prop];
          if (propValue) {
            secondaryFilters.push({
              propertyName: prop,
              operator: 'EQ',
              value: propValue
            });
          }
        }
        
        // Create filter groups
        if (secondaryFilters.length > 0) {
          console.log("Using strict duplicate matching (name + at least one secondary identifier)");
          secondaryFilters.forEach(secondaryFilter => {
            filterGroups.push({
              filters: [nameFilter, secondaryFilter]
            });
          });
        } else {
          console.log("Using name-only matching (no secondary identifiers available)");
          filterGroups.push({
            filters: [nameFilter]
          });
        }
      }
      
      // Exit early if no valid search criteria
      if (filterGroups.length === 0) {
        console.log('No valid properties to deduplicate on');
        markAsPrimary(hubspotClient, event.object.objectId, callback);
        return;
      }
      
      // Step 4: Search for potential duplicates
      hubspotClient.crm.companies.searchApi
        .doSearch({
          filterGroups: filterGroups,
          limit: 100,
          sorts: ["id"]
        })
        .then(searchResults => {
          // Get unique IDs of matching companies, excluding the current company
          const matchingIds = searchResults.results
            .map(object => object.id)
            .filter(id => Number(id) !== Number(event.object.objectId));
          
          // Remove duplicates from the matching IDs
          const uniqueIds = [...new Set(matchingIds)];
          
          // Step 5: Handle no matches scenario
          if (uniqueIds.length === 0) {
            console.log('No matching companies found, marking as primary');
            markAsPrimary(hubspotClient, event.object.objectId, callback);
            return;
          }
          
          // Step 6: Handle matches scenario
          console.log(`Found ${uniqueIds.length} matching companies: ${uniqueIds.join(', ')}`);
          
          // Add all company IDs (including current) to find the oldest
          const allCompanyIds = [...uniqueIds, event.object.objectId];
          
          // Sort all IDs numerically (ascending order)
          allCompanyIds.sort((a, b) => Number(a) - Number(b));
          
          // Take the lowest ID (likely the oldest record) as the primary
          const primaryId = allCompanyIds[0];
          console.log(`Selected oldest company (ID: ${primaryId}) as the primary record`);
          
          // Step 7: Determine merge direction
          if (primaryId === event.object.objectId) {
            // Current company is primary - merge duplicates into it
            if (uniqueIds.length > 0) {
              // If primary has duplicates, merge one of them in
              const duplicateToMerge = uniqueIds[0];
              console.log(`This company is primary. Will merge duplicate (${duplicateToMerge}) into it`);
              
              // First mark the duplicate as being merged
              markAsMerged(hubspotClient, duplicateToMerge)
                .then(() => {
                  // Then do the actual merge
                  return mergeCompanies(
                    hubspotClient, 
                    event.object.objectId,  // Primary (current)
                    duplicateToMerge        // To be merged
                  );
                })
                .then(() => {
                  // Then update primary status
                  return markAsPrimary(hubspotClient, event.object.objectId);
                })
                .then(() => {
                  // Success!
                  callback({
                    outputFields: {
                      result: 'Successfully merged duplicate into this company',
                      primaryCompanyId: event.object.objectId,
                      mergedCompanyId: duplicateToMerge,
                      remainingDuplicates: uniqueIds.length - 1
                    }
                  });
                })
                .catch(error => {
                  console.error(`Error during merge process: ${error.message}`);
                  throw error;
                });
            } else {
              // If no duplicates, just mark as primary
              markAsPrimary(hubspotClient, event.object.objectId, callback);
            }
          } else {
            // Current company is NOT primary - merge it into the primary
            console.log(`This company is NOT primary. Will merge into primary (${primaryId})`);
            
            // First mark current as being merged
            markAsMerged(hubspotClient, event.object.objectId)
              .then(() => {
                // Then do the actual merge
                return mergeCompanies(
                  hubspotClient, 
                  primaryId,              // Primary (another company)
                  event.object.objectId   // To be merged (current)
                );
              })
              .then(() => {
                // Then update primary status
                return markAsPrimary(hubspotClient, primaryId);
              })
              .then(() => {
                // Success!
                callback({
                  outputFields: {
                    result: 'Successfully merged into primary company',
                    primaryCompanyId: primaryId,
                    mergedCompanyId: event.object.objectId
                  }
                });
              })
              .catch(error => {
                console.error(`Error during merge process: ${error.message}`);
                throw error;
              });
          }
        })
        .catch(error => {
          console.error(`Error searching for companies: ${error.message}`);
          throw error;
        });
    })
    .catch(error => {
      console.error(`Error getting company details: ${error.message}`);
      throw error;
    });
};

// Helper function to mark a company as primary
function markAsPrimary(hubspotClient, companyId, callback = null) {
  console.log(`Marking company ${companyId} as 'primary'`);
  
  return hubspotClient.crm.companies.basicApi
    .update(companyId, {
      properties: {
        [DEDUPLICATION_STATUS_PROPERTY]: 'primary'
      }
    })
    .then((response) => {
      console.log(`✓ Successfully marked company ${companyId} as primary`);
      
      if (callback) {
        callback({
          outputFields: {
            result: 'Marked as primary',
            primaryCompanyId: companyId
          }
        });
      }
      
      return response;
    });
}

// Helper function to mark a company as merged
function markAsMerged(hubspotClient, companyId) {
  console.log(`Marking company ${companyId} as 'merged'`);
  
  return hubspotClient.crm.companies.basicApi
    .update(companyId, {
      properties: {
        [DEDUPLICATION_STATUS_PROPERTY]: 'merged'
      }
    })
    .then((response) => {
      console.log(`✓ Successfully marked company ${companyId} as merged`);
      return response;
    });
}

// Helper function to merge two companies
function mergeCompanies(hubspotClient, primaryId, mergeId) {
  console.log(`Merging company ${mergeId} into ${primaryId}`);
  
  return hubspotClient.apiRequest({
    method: 'POST',
    path: `/crm/v3/objects/companies/merge`,
    body: {
      primaryObjectId: primaryId,
      objectIdToMerge: mergeId
    }
  })
  .then((response) => {
    console.log(`✓ Successfully merged company ${mergeId} into ${primaryId}`);
    return response;
  });
}
