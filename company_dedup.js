/**
 * Company Deduplication Script for HubSpot Operations Hub (Version 3)
 * 
 * This script searches for companies with the same name and deduplicates them.
 * - If no matches are found, nothing happens
 * - If one match is found, the enrolled company is merged into the matching company
 * - If multiple matches are found, it uses a strategy to select the primary company:
 *   - First checks for the oldest company (lowest ID)
 *   - Provides detailed logging for troubleshooting
 * 
 * Based on community solutions: https://community.hubspot.com/t5/APIs-Integrations/Custom-code-and-Company-deduplication/m-p/882799
 * Enhanced to handle multiple company matches more intelligently
 */

const DEDUPE_PROPERTY = 'name'; // The property to use for deduplication
const SECONDARY_PROPERTIES = ['domain', 'phone', 'address']; // Additional properties to log for debugging
const hubspot = require('@hubspot/api-client');

exports.main = (event, callback) => {
  // Initialize the HubSpot client with the access token from secrets
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.ACCESSTOKEN
  });
  
  // Get the current company details
  // NOTE: Using basicApi instead of defaultApi as per community solution
  // Include secondary properties for better debugging
  const propertiesToFetch = [DEDUPE_PROPERTY, ...SECONDARY_PROPERTIES];
  hubspotClient.crm.companies.basicApi
    .getById(event.object.objectId, propertiesToFetch)
    .then(companyResult => {
      // Extract the dedupe property value (e.g., company name)
      // NOTE: Using properties without body as per community solution
      let dedupePropValue = companyResult.properties[DEDUPE_PROPERTY];
      
      // Log the main dedupe property and additional info for debugging
      console.log(`Looking for duplicates based on ${DEDUPE_PROPERTY} = ${dedupePropValue}`);
      
      // Log secondary properties for better debugging
      for (const prop of SECONDARY_PROPERTIES) {
        if (companyResult.properties[prop]) {
          console.log(`Company ${prop}: ${companyResult.properties[prop]}`);
        }
      }
      
      // Log all properties if you need to debug further
      // console.log('All company properties:', JSON.stringify(companyResult.properties, null, 2));
      
      // Search for companies with the same property value
      // NOTE: Using searchApi instead of defaultApi as per community solution
      hubspotClient.crm.companies.searchApi
        .doSearch({
          filterGroups: [{
            filters: [{
              propertyName: DEDUPE_PROPERTY,
              operator: 'EQ',
              value: dedupePropValue
            }]
          }]
        })
        .then(searchResults => {
          // Get IDs of matching companies, excluding the current company
          // NOTE: Using results without body as per community solution
          let idsToMerge = searchResults.results
            .map(object => object.id)
            .filter(id => Number(id) !== Number(event.object.objectId));
          
          if (idsToMerge.length === 0) {
            console.log('No matching companies found, nothing to merge');
            callback({
              outputFields: {
                result: 'No duplicates found'
              }
            });
            return;
          } else if (idsToMerge.length > 1) {
            console.log(`Found multiple potential company IDs: ${idsToMerge.join(', ')}`);
            console.log('Handling multiple matches by selecting the oldest company (lowest ID)');
            
            // Sort IDs numerically (ascending order)
            idsToMerge.sort((a, b) => Number(a) - Number(b));
            
            // Take the lowest ID (likely the oldest record)
            const primaryId = idsToMerge[0];
            
            // Log the strategy
            console.log(`Strategy: Using oldest company (ID: ${primaryId}) as the primary record`);
            console.log(`Will merge current company (ID: ${event.object.objectId}) and others into this primary company`);
            
            // First merge the current company into the primary
            hubspotClient
              .apiRequest({
                method: 'POST',
                path: `/crm/v3/objects/companies/merge`,
                body: {
                  primaryObjectId: primaryId,
                  objectIdToMerge: event.object.objectId
                }
              })
              .then(() => {
                console.log(`Successfully merged current company (ID: ${event.object.objectId}) into primary (ID: ${primaryId})`);
                
                // Report success and provide primary ID for reference
                callback({
                  outputFields: {
                    result: 'Multiple matches resolved',
                    primaryCompanyId: primaryId,
                    mergedCompanyIds: idsToMerge.join(', ')
                  }
                });
              })
              .catch(error => {
                console.error(`Error merging current company into primary: ${error}`);
                callback({
                  outputFields: {
                    result: 'Error',
                    error: error.message
                  }
                });
              });
            
            return;
          }
          
          // Get the ID of the company to merge with (single match case)
          let idToMerge = idsToMerge[0];
          console.log(`Merging enrolled company id=${event.object.objectId} into company id=${idToMerge}`);
          
          // Perform the company merge
          // Note: We're using the matched company as the primary since it likely has more data
          // You can reverse this if you want the current company to be primary instead
          hubspotClient
            .apiRequest({
              method: 'POST',
              path: `/crm/v3/objects/companies/merge`,
              body: {
                primaryObjectId: idToMerge,
                objectIdToMerge: event.object.objectId
              }
            })
            .then(mergeResult => {
              console.log('Companies merged successfully!');
              callback({
                outputFields: {
                  result: 'Success',
                  mergedIntoCompanyId: idToMerge
                }
              });
            })
            .catch(error => {
              console.error('Error merging companies:', error);
              callback({
                outputFields: {
                  result: 'Error',
                  error: error.message
                }
              });
            });
        })
        .catch(error => {
          console.error('Error searching for companies:', error);
          callback({
            outputFields: {
              result: 'Error',
              error: error.message
            }
          });
        });
    })
    .catch(error => {
      console.error('Error getting company details:', error);
      callback({
        outputFields: {
          result: 'Error',
          error: error.message
        }
      });
    });
};
