import CryptoJS from 'crypto-js';
import * as asn1js from 'asn1js';
import { Certificate } from 'pkijs';

export const converters = {
  timestamp: {
    name: 'Timestamp to Date',
    convert: function(input) {
      const timestamps = input.match(/\d+/g);
      if (!timestamps) {
        throw new Error("No timestamps found in the text. Please enter a number like 1699893347 or 1699893347000");
      }

      let results = [];
      let validCount = 0;
      for (const ts of timestamps) {
        try {
          const timestamp = parseInt(ts);
          if (isNaN(timestamp)) continue;

          if (timestamp < 1000000000 || timestamp > 9999999999999) continue;

          let dates = [];
          if (ts.length >= 13) {
            const msDate = new Date(timestamp);
            if (msDate.getTime() > 0 && msDate.getFullYear() > 1970 && msDate.getFullYear() < 2100) {
              dates.push({ format: "milliseconds", date: msDate });
            }
          }
          const secsDate = new Date(timestamp * 1000);
          if (secsDate.getTime() > 0 && secsDate.getFullYear() > 1970 && secsDate.getFullYear() < 2100) {
            dates.push({ format: "seconds", date: secsDate });
          }

          if (dates.length > 0) {
            validCount++;
            results.push(`\nTimestamp: ${ts}`);
            dates.forEach(({format, date}) => {
              results.push(`Format: ${format}`);
              results.push(`UTC: ${date.toUTCString()}`);
              results.push(`Local: ${date.toString()}`);
            });
            results.push("---");
          }
        } catch (e) {
          continue;
        }
      }

      if (validCount === 0) {
        throw new Error("No valid timestamps found. Please enter a Unix timestamp (e.g., 1699893347 or 1699893347000)");
      }

      return results.join('\n');
    }
  },
  hexToBase64: {
    name: 'Hex to Base64',
    convert: function(hexString) {
      try {
        const cleanHex = hexString.replace(/0x/g, '').replace(/\s/g, '');
        if (!/^[0-9A-Fa-f]+$/.test(cleanHex)) {
          throw new Error("Invalid hex string");
        }
        
        const bytes = cleanHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
        const byteArray = new Uint8Array(bytes);
        const base64 = btoa(String.fromCharCode.apply(null, byteArray));
        
        return `Hex Input:\n${hexString}\n\nBase64 Output:\n${base64}`;
      } catch (error) {
        throw new Error(`Hex to Base64 conversion failed: ${error.message}`);
      }
    }
  },
  base64ToHex: {
    name: 'Base64 to Hex',
    convert: function(encodedString) {
      try {
        const binaryString = atob(encodedString);
        const hexArray = Array.from(binaryString).map(char => {
          const hex = char.charCodeAt(0).toString(16).padStart(2, '0');
          return '0x' + hex.toUpperCase();
        });
        
        return `Base64 Input:\n${encodedString}\n\nHex Output:\n${hexArray.join(' ')}`;
      } catch (error) {
        throw new Error(`Base64 to Hex conversion failed: ${error.message}`);
      }
    }
  },
  jsonToCsv: {
    name: 'JSON to CSV',
    convert: function(input) {
      try {
        const json = JSON.parse(input);
        const data = Array.isArray(json) ? json : (json.people || Object.values(json)[0]);
        
        if (!Array.isArray(data)) {
          throw new Error("Input must contain an array of objects");
        }
        if (data.length === 0) {
          throw new Error("Input array is empty");
        }

        function flattenObject(obj, prefix = '') {
          return Object.keys(obj).reduce((acc, key) => {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (value === null) {
              acc[newKey] = 'null';
            } else if (Array.isArray(value)) {
              acc[newKey] = JSON.stringify(value);
            } else if (typeof value === 'object') {
              Object.assign(acc, flattenObject(value, newKey));
            } else {
              acc[newKey] = value;
            }
            
            return acc;
          }, {});
        }

        const flattenedData = data.map(item => flattenObject(item));
        const headers = [...new Set(
          flattenedData.reduce((acc, item) => [...acc, ...Object.keys(item)], [])
        )].sort();

        const csvRows = [headers.join(',')];
        
        for (const row of flattenedData) {
          const values = headers.map(header => {
            const val = row[header] ?? '';
            if (typeof val === 'string') {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          });
          csvRows.push(values.join(','));
        }

        return `CSV Output:\n${csvRows.join('\n')}`;
      } catch (error) {
        throw new Error(`JSON to CSV conversion failed: ${error.message}`);
      }
    }
  },
  jwt: {
    name: 'JWT Parser',
    convert: function(input) {
      try {
        const jwt = input.trim();
        if (!jwt) {
          throw new Error('Empty JWT token');
        }

        const [headerB64, payloadB64] = jwt.split('.');
        if (!headerB64 || !payloadB64) {
          throw new Error('Invalid JWT format');
        }
        
        const header = JSON.parse(atob(headerB64));
        const payload = JSON.parse(atob(payloadB64));

        return `JWT Header:\n${JSON.stringify(header, null, 2)}\n\nJWT Payload:\n${JSON.stringify(payload, null, 2)}`;
      } catch (e) {
        throw new Error('Invalid JWT format: ' + e.message);
      }
    }
  },
  certDecoder: {
    name: 'Certificate Decoder',
    convert: function(input) {
      try {
        // Handle /n in the input
        let pemContent = input
          .replace(/\\n/g, '\n')  // Replace \n string with actual newlines
          .trim();

        // Check if it's a PEM certificate
        if (!pemContent.includes('-----BEGIN CERTIFICATE-----') || !pemContent.includes('-----END CERTIFICATE-----')) {
          throw new Error('Invalid certificate format. Must be a PEM encoded certificate.');
        }

        // Extract the base64 content between the BEGIN and END markers
        const base64Content = pemContent
          .replace('-----BEGIN CERTIFICATE-----', '')
          .replace('-----END CERTIFICATE-----', '')
          .replace(/[\r\n\s]/g, '');

        // Decode the base64 content
        const binaryString = CryptoJS.enc.Base64.parse(base64Content);
        const binaryData = new Uint8Array(binaryString.words.length * 4);
        for (let i = 0; i < binaryString.words.length; i++) {
          const word = binaryString.words[i];
          binaryData[i * 4] = (word >> 24) & 0xFF;
          binaryData[i * 4 + 1] = (word >> 16) & 0xFF;
          binaryData[i * 4 + 2] = (word >> 8) & 0xFF;
          binaryData[i * 4 + 3] = word & 0xFF;
        }

        // Parse the ASN.1 structure
        const asn1 = asn1js.fromBER(binaryData.buffer);
        if (asn1.offset === -1) {
          throw new Error('Invalid ASN.1 structure');
        }

        // Parse the certificate
        const certificate = new Certificate({ schema: asn1.result });

        // Format the certificate with proper line breaks
        const formattedCert = '-----BEGIN CERTIFICATE-----\n' +
          base64Content.match(/.{1,64}/g).join('\n') +
          '\n-----END CERTIFICATE-----';

        // Extract certificate information
        const info = {
          subject: certificate.subject.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(', '),
          issuer: certificate.issuer.typesAndValues.map(tv => `${tv.type}=${tv.value.valueBlock.value}`).join(', '),
          validFrom: certificate.notBefore.value.toUTCString(),
          validTo: certificate.notAfter.value.toUTCString(),
          serialNumber: certificate.serialNumber.valueBlock.toString(),
          signatureAlgorithm: certificate.signatureAlgorithm.algorithmId
        };

        return `# Certificate Information:
Subject: ${info.subject}
Issuer: ${info.issuer}
Valid From: ${info.validFrom}
Valid To: ${info.validTo}
Serial Number: ${info.serialNumber}
Signature Algorithm: ${info.signatureAlgorithm}

# Formatted Certificate:
${formattedCert}`;
      } catch (error) {
        throw new Error(`Certificate decoding failed: ${error.message}`);
      }
    }
  }
};
