/**
 * Person types following the Stripe API specification.
 *
 * This is an object representing a person associated with a Zoneless account.
 * Persons are used to collect information about individuals associated with
 * the account's legal entity.
 *
 * @see https://docs.stripe.com/api/persons
 */

/**
 * Address object for a person.
 */
export interface PersonAddress {
  /** City, district, suburb, town, or village */
  city: string | null;
  /** Two-letter country code (ISO 3166-1 alpha-2) */
  country: string | null;
  /** Address line 1, such as the street, PO Box, or company name */
  line1: string | null;
  /** Address line 2, such as the apartment, suite, unit, or building */
  line2?: string | null;
  /** ZIP or postal code */
  postal_code: string | null;
  /** State, county, province, or region (ISO 3166-2) */
  state?: string | null;
}

/**
 * Date of birth object.
 */
export interface PersonDob {
  /** The day of birth, between 1 and 31 */
  day: number | null;
  /** The month of birth, between 1 and 12 */
  month: number | null;
  /** The four-digit year of birth */
  year: number | null;
}

/**
 * Describes the person's relationship to the account's legal entity.
 */
export interface PersonRelationship {
  /** Whether the person is the authorizer of the account's representative */
  authorizer?: boolean | null;
  /** Whether the person is a director of the account's legal entity */
  director?: boolean | null;
  /** Whether the person has significant responsibility to control, manage, or direct the organization */
  executive?: boolean | null;
  /** Whether the person is the legal guardian of the account's representative */
  legal_guardian?: boolean | null;
  /** Whether the person is an owner of the account's legal entity */
  owner?: boolean | null;
  /** The percent owned by the person of the account's legal entity */
  percent_ownership?: number | null;
  /** Whether the person is authorized as the primary representative of the account */
  representative?: boolean | null;
  /** The person's title (e.g., CEO, Support Engineer) */
  title?: string | null;
}

/**
 * Document verification information.
 */
export interface PersonVerificationDocument {
  /** The back of an ID returned by a file upload with a purpose value of identity_document */
  back: string | null;
  /** A user-displayable string describing the verification state of this document */
  details: string | null;
  /** A machine-readable code specifying the verification state for this document */
  details_code: string | null;
  /** The front of an ID returned by a file upload with a purpose value of identity_document */
  front: string | null;
}

/**
 * Verification information for a person.
 */
export interface PersonVerification {
  /** A document showing address, either a passport, local ID card, or utility bill */
  additional_document: PersonVerificationDocument | null;
  /** A user-displayable string describing the verification state for the person */
  details: string | null;
  /** A machine-readable code specifying the verification state for the person */
  details_code: string | null;
  /** An identifying document, either a passport or local ID card */
  document: PersonVerificationDocument;
  /** The state of verification for the person: unverified, pending, or verified */
  status: 'unverified' | 'pending' | 'verified';
}

/**
 * Requirement error details.
 */
export interface PersonRequirementError {
  /** The code for the type of error */
  code: string;
  /** An informative message that indicates the error type and provides additional details */
  reason: string;
  /** The specific user onboarding requirement field that needs to be resolved */
  requirement: string;
}

/**
 * Alternative fields for requirements.
 */
export interface PersonRequirementAlternative {
  /** Fields that can be provided to resolve all fields in original_fields_due */
  alternative_fields_due: string[];
  /** Fields that are due and can be resolved by providing all fields in alternative_fields_due */
  original_fields_due: string[];
}

/**
 * Requirements information for a person.
 */
export interface PersonRequirements {
  /** Fields that are due and can be resolved by providing alternative fields */
  alternatives: PersonRequirementAlternative[] | null;
  /** Fields that need to be resolved to keep the person's account enabled */
  currently_due: string[];
  /** Details about validation and verification failures */
  errors: PersonRequirementError[];
  /** Fields you must collect when all thresholds are reached */
  eventually_due: string[];
  /** Fields that haven't been resolved by the account's current_deadline */
  past_due: string[];
  /** Fields that are being reviewed or might become required */
  pending_verification: string[];
}

/**
 * Person object representing an individual associated with an account.
 */
export interface Person {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value */
  object: 'person';
  /** The account the person is associated with */
  account: string;
  /** Time at which the object was created. Measured in seconds since the Unix epoch */
  created: number;
  /** The person's date of birth */
  dob: PersonDob | null;
  /** The person's email address */
  email: string | null;
  /** The person's first name */
  first_name: string | null;
  /** Information about the upcoming new requirements for this person */
  future_requirements: PersonRequirements | null;
  /** Whether the person's id_number was provided */
  id_number_provided: boolean;
  /** The person's last name */
  last_name: string | null;
  /** Set of key-value pairs for storing additional information */
  metadata: Record<string, string>;
  /** The person's phone number */
  phone?: string | null;
  /** Describes the person's relationship to the account */
  relationship: PersonRelationship;
  /** Information about the requirements for this person */
  requirements: PersonRequirements | null;
  /** Whether the last four digits of the person's SSN have been provided (U.S. only) */
  ssn_last_4_provided: boolean;
  /** The person's verification status */
  verification: PersonVerification;
  /** The person's address */
  address?: PersonAddress | null;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}

/**
 * Deleted person response object.
 */
export interface PersonDeleted {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type */
  object: 'person';
  /** Always true for a deleted object */
  deleted: true;
}
