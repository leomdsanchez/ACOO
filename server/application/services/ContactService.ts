import type { OperationalRepository } from "../ports/OperationalRepository.js";
import type { ContactRecord, CreateContactInput } from "../../domain/models.js";

export class ContactService {
  public constructor(private readonly repository: OperationalRepository) {}

  public listContacts(): Promise<ContactRecord[]> {
    return this.repository.listContacts();
  }

  public createContact(input: CreateContactInput): Promise<ContactRecord> {
    return this.repository.createContact(input);
  }
}
