import { BrowserProvider, getAddress, toBeHex, zeroPadValue, Signer } from "ethers";

let fheInstance: any = null;

export const initializeFheInstance = async () => {
    if (fheInstance) return fheInstance;

    if (typeof window === 'undefined') {
        throw new Error('Window not available');
    }
    
    // FHEVM SDK requires window.ethereum, but we can create a mock if needed
    // For now, still require it but log a warning
    if (!window.ethereum) {
        console.warn('window.ethereum not found - FHEVM might not work properly');
        // Try to continue anyway - SDK might handle it
    }

    // @ts-ignore
    const sdk = window.RelayerSDK || window.relayerSDK;
    if (!sdk) {
        throw new Error('RelayerSDK not loaded');
    }

    const { initSDK, createInstance, SepoliaConfig } = sdk;

    await initSDK();

    const config = { ...SepoliaConfig, network: window.ethereum };

    try {
        fheInstance = await createInstance(config);
        return fheInstance;
    } catch (err) {
        console.error('FHEVM initialization failed:', err);
        throw err;
    }
};

export const getFheInstance = () => fheInstance;

export const createEncryptedInput = async (contractAddress: string, userAddress: string, value: number) => {
    const instance = await initializeFheInstance();
    const inputHandle = instance.createEncryptedInput(contractAddress, userAddress);
    inputHandle.add32(value);
    return await inputHandle.encrypt();
};

export const createEncryptedInput8 = async (contractAddress: string, userAddress: string, value: number) => {
    const instance = await initializeFheInstance();
    const inputHandle = instance.createEncryptedInput(contractAddress, userAddress);
    inputHandle.add8(value);
    return await inputHandle.encrypt();
};

export const reencrypt = async (
    handle: bigint, 
    contractAddress: string, 
    userAddress: string,
    signer?: Signer // Optional: app wallet signer, fallback to MetaMask
) => {
    const instance = await initializeFheInstance();

    // Ensure addresses are checksummed
    const checksummedContractAddress = getAddress(contractAddress);
    const checksummedUserAddress = getAddress(userAddress);

    // Generate a temporary keypair for re-encryption
    const keypair = instance.generateKeypair();

    // Convert bigint handle to bytes32 hex string (0x + 64 hex chars)
    const handleHex = zeroPadValue(toBeHex(handle), 32);

    const handleContractPairs = [
        {
            handle: handleHex,
            contractAddress: checksummedContractAddress,
        },
    ];

    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10";
    const contractAddresses = [checksummedContractAddress];

    // Create EIP-712 signature for authorization
    const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays
    );

    // Use provided signer (app wallet) or fallback to MetaMask
    let finalSigner = signer;
    if (!finalSigner) {
        if (!window.ethereum) {
            throw new Error('No signer provided and MetaMask not available');
        }
        const provider = new BrowserProvider(window.ethereum);
        finalSigner = await provider.getSigner();
    }

    const signature = await finalSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
    );

    // Perform re-encryption using userDecrypt
    const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        contractAddresses,
        checksummedUserAddress,
        startTimeStamp,
        durationDays
    );

    return result[handleHex];
};

// Decrypt multiple handles with a SINGLE signature
export const reencryptMultiple = async (
    handles: bigint[], 
    contractAddress: string, 
    userAddress: string,
    signer?: Signer // Optional: app wallet signer, fallback to MetaMask
) => {
    const instance = await initializeFheInstance();

    // Ensure addresses are checksummed
    const checksummedContractAddress = getAddress(contractAddress);
    const checksummedUserAddress = getAddress(userAddress);

    // Generate a temporary keypair for re-encryption
    const keypair = instance.generateKeypair();

    // Convert all handles to hex format
    const handleHexArray = handles.map(h => zeroPadValue(toBeHex(h), 32));

    // Create handle-contract pairs for all handles
    const handleContractPairs = handleHexArray.map(handleHex => ({
        handle: handleHex,
        contractAddress: checksummedContractAddress,
    }));

    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "10";
    const contractAddresses = [checksummedContractAddress];

    // Create EIP-712 signature for authorization (ONCE for all handles)
    const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays
    );

    // Use provided signer (app wallet) or fallback to MetaMask
    let finalSigner = signer;
    if (!finalSigner) {
        if (!window.ethereum) {
            throw new Error('No signer provided and MetaMask not available');
        }
        const provider = new BrowserProvider(window.ethereum);
        finalSigner = await provider.getSigner();
    }

    // Request signature (ONLY ONCE for all handles!)
    const signature = await finalSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
    );

    // Perform re-encryption for all handles with single signature
    const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        contractAddresses,
        checksummedUserAddress,
        startTimeStamp,
        durationDays
    );

    // Return array of decrypted values in same order as input handles
    return handleHexArray.map(hex => result[hex]);
};

// Decrypt publicly decryptable handles (no signature needed)
export const publicDecrypt = async (handle: bigint, timeoutMs: number = 120000) => {
    const instance = await initializeFheInstance();
    
    // Convert bigint handle to 64 hex chars (no 0x prefix) for publicDecrypt
    const handleHex = zeroPadValue(toBeHex(handle), 32).slice(2); // Remove 0x prefix
    
    // Validate format
    if (handleHex.length !== 64) {
        throw new Error(`Invalid handle format: expected 32 bytes (64 hex chars), got ${handleHex.length} chars. Handle: ${handleHex}`);
    }

    try {
        // Wrap publicDecrypt with timeout
        const decryptPromise = instance.publicDecrypt([handleHex]);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`publicDecrypt timeout after ${timeoutMs}ms. Handle may not be ready from Gateway yet.`));
            }, timeoutMs);
        });
        
        const result = await Promise.race([decryptPromise, timeoutPromise]);

        // SDK v0.9: Try different possible response formats
        let clearValue: any;

        // Format 1: result.clearValues is an object with handleHex as key
        if (result.clearValues && typeof result.clearValues === 'object') {
            // clearValues might be an object with handleHex as key, or an array
            if (result.clearValues[handleHex] !== undefined) {
                clearValue = result.clearValues[handleHex];
            } else if (Array.isArray(result.clearValues) && result.clearValues.length > 0) {
                // If it's an array, take first element
                clearValue = result.clearValues[0];
            } else {
                // Try to get first value from object
                const keys = Object.keys(result.clearValues);
                if (keys.length > 0) {
                    clearValue = result.clearValues[keys[0]];
                }
            }
        }
        // Format 2: result[handleHex] may be an object with clearValue
        else if (result[handleHex]) {
            const handleResult = result[handleHex];
            if (typeof handleResult === 'object') {
                clearValue = handleResult.clearValue || handleResult.value;
            } else {
                clearValue = handleResult;
            }
        }
        // Format 3: result is an array with [clearValue, proof]
        else if (Array.isArray(result) && result.length >= 1) {
            clearValue = result[0];
        }
        // Format 4: Direct properties
        else {
            clearValue = result.clearValue || result.value;
        }
        
        // If still undefined, try abiEncodedClearValues (decode from hex)
        if (clearValue === undefined && result.abiEncodedClearValues) {
            // abiEncodedClearValues is hex-encoded, decode it
            // For euint8, it's a single uint8 value
            try {
                const hexValue = result.abiEncodedClearValues;
                // Remove 0x prefix and pad to 64 chars (32 bytes)
                const paddedHex = hexValue.startsWith('0x') ? hexValue.slice(2).padStart(64, '0') : hexValue.padStart(64, '0');
                // Last byte is the uint8 value
                const lastByte = paddedHex.slice(-2);
                clearValue = parseInt(lastByte, 16);
            } catch (e) {
                console.warn('Failed to decode abiEncodedClearValues:', e);
            }
        }

        if (clearValue === undefined) {
            // Avoid JSON.stringify with BigInt - convert to string manually
            const resultStr = typeof result === 'object' && result !== null
                ? Object.keys(result).map(k => `${k}: ${String(result[k])}`).join(', ')
                : String(result);
            throw new Error(`Invalid publicDecrypt response format. Result: ${resultStr}`);
        }

        return clearValue;
    } catch (error) {
        console.error("❌ publicDecrypt failed:", error);
        throw error;
    }
};

// Decrypt multiple publicly decryptable handles at once (no signature needed)
// Returns array of decrypted values in same order as input handles
export const publicDecryptMultiple = async (handles: bigint[], timeoutMs: number = 120000) => {
    const instance = await initializeFheInstance();
    
    // Convert all handles to hex format (64 hex chars, no 0x prefix)
    const handleHexArray = handles.map(h => {
        const handleHex = zeroPadValue(toBeHex(h), 32).slice(2); // Remove 0x prefix
        
        // Validate format
        if (handleHex.length !== 64) {
            throw new Error(`Invalid handle format: expected 32 bytes (64 hex chars), got ${handleHex.length} chars. Handle: ${handleHex}`);
        }
        
        return handleHex;
    });
    
    if (handleHexArray.length === 0) {
        return [];
    }
    
    try {
        // Batch decrypt all handles at once
        const decryptPromise = instance.publicDecrypt(handleHexArray);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`publicDecryptMultiple timeout after ${timeoutMs}ms. Some handles may not be ready from Gateway yet.`));
            }, timeoutMs);
        });
        
        const result = await Promise.race([decryptPromise, timeoutPromise]);
        
        // Extract decrypted values from result in the same order as input handles
        const decryptedValues = handleHexArray.map(handleHex => {
            let clearValue: any;
            
            // Format 1: result.clearValues is an object with handleHex as key
            if (result.clearValues && typeof result.clearValues === 'object') {
                if (result.clearValues[handleHex] !== undefined) {
                    clearValue = result.clearValues[handleHex];
                } else if (Array.isArray(result.clearValues)) {
                    // If it's an array, use index
                    const index = handleHexArray.indexOf(handleHex);
                    clearValue = result.clearValues[index];
                } else {
                    // Try to get value from object
                    const keys = Object.keys(result.clearValues);
                    const index = handleHexArray.indexOf(handleHex);
                    if (keys[index]) {
                        clearValue = result.clearValues[keys[index]];
                    }
                }
            }
            // Format 2: result[handleHex] may be an object with clearValue
            else if (result[handleHex]) {
                const handleResult = result[handleHex];
                if (typeof handleResult === 'object') {
                    clearValue = handleResult.clearValue || handleResult.value;
                } else {
                    clearValue = handleResult;
                }
            }
            // Format 3: result is an array with [clearValue, proof]
            else if (Array.isArray(result)) {
                const index = handleHexArray.indexOf(handleHex);
                if (result[index] && Array.isArray(result[index])) {
                    clearValue = result[index][0];
                } else {
                    clearValue = result[index];
                }
            }
            // Format 4: Direct properties
            else {
                clearValue = result.clearValue || result.value;
            }
            
            // If still undefined, try abiEncodedClearValues (decode from hex)
            if (clearValue === undefined && result.abiEncodedClearValues) {
                try {
                    const hexValue = Array.isArray(result.abiEncodedClearValues) 
                        ? result.abiEncodedClearValues[handleHexArray.indexOf(handleHex)]
                        : result.abiEncodedClearValues;
                    
                    if (hexValue) {
                        const paddedHex = hexValue.startsWith('0x') ? hexValue.slice(2).padStart(64, '0') : hexValue.padStart(64, '0');
                        const lastByte = paddedHex.slice(-2);
                        clearValue = parseInt(lastByte, 16);
                    }
                } catch (e) {
                    console.warn('Failed to decode abiEncodedClearValues for handle:', handleHex, e);
                }
            }
            
            if (clearValue === undefined) {
                throw new Error(`Could not extract clearValue for handle: ${handleHex}`);
            }
            
            return clearValue;
        });
        
        return decryptedValues;
    } catch (error) {
        console.error("❌ publicDecryptMultiple failed:", error);
        throw error;
    }
};