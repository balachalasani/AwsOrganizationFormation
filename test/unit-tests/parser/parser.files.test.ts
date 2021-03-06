import { TemplateRoot } from '~parser/parser';
import Sinon from 'sinon';
import { ConsoleUtil } from '../../../src/console-util';

describe('when parsing file', () => {

    test('it throws for empty file', () => {
        expect(() => { TemplateRoot.create('./test/resources/empty-file.yml'); }).toThrowError(/empty-file/);
        expect(() => { TemplateRoot.create('./test/resources/empty-file.yml'); }).toThrowError(/is empty/);
    });

    test('it throws for invalid version', () => {
        expect(() => { TemplateRoot.create('./test/resources/invalid-version.yml'); }).toThrowError(/Unexpected AWSTemplateFormatVersion version/);
    });

    test('it throws for invalid yaml', () => {
        expect(() => { TemplateRoot.create('./test/resources/invalid-yml.yml'); }).toThrowError(/AWSTemplateFormatVersion is missing/);
    });

    test('it throws for missing version', () => {
        expect(() => { TemplateRoot.create('./test/resources/missing-version.yml'); }).toThrowError(/AWSTemplateFormatVersion is missing/);
    });

    test('it throws for missing organization attribute', () => {
        expect(() => { TemplateRoot.create('./test/resources/missing-organization.yml'); }).toThrowError(/Organization attribute is missing/);
    });

    test('it throws for invalid include (not found)', () => {
        expect(() => { TemplateRoot.create('./test/resources/invalid-include-notfound.yml'); }).toThrowError(/no such file or directory/);
        expect(() => { TemplateRoot.create('./test/resources/invalid-include-notfound.yml'); }).toThrowError(/\/not-found.yml/);
    });

    test('it throws for invalid include (invalid yml)', () => {
        expect(() => { TemplateRoot.create('./test/resources/invalid-include-invalid-yml.yml'); }).toThrowError();
    });
});

describe('when loading basic organization from file', () => {
    let basic: TemplateRoot;

    beforeEach(() => {
        basic = TemplateRoot.create('./test/resources/valid-basic.yml');
    });

    test('it parses successfully', () => {
        expect(basic).toBeDefined();
    });

    test('it contains master account', () => {
        expect(basic.organizationSection.masterAccount).toBeDefined();
    });

    test('master account has logical id and type', () => {
        expect(basic.organizationSection.masterAccount.logicalId).toBe('MasterAccount');
        expect(basic.organizationSection.masterAccount.type).toBe('OC::ORG::MasterAccount');
    });

    test('master account has the right attributes', () => {
        expect(basic.organizationSection.masterAccount.accountName).toBe('My Organization Root');
        expect(basic.organizationSection.masterAccount.accountId).toBe('123456789012');
        expect(basic.organizationSection.masterAccount.rootEmail).toBeUndefined();
    });

    test('it contains no other organizational resources', () => {
        expect(basic.organizationSection.accounts.length).toBe(0);
        expect(basic.organizationSection.organizationalUnits.length).toBe(0);
        expect(basic.organizationSection.serviceControlPolicies.length).toBe(0);
        expect(basic.organizationSection.organizationRoot).toBeUndefined();
    });
});

describe('when loading basic organization using include', () => {
    let basic: TemplateRoot;
    let include: TemplateRoot;

    beforeEach(() => {
        basic = TemplateRoot.create('./test/resources/valid-basic.yml');
        include = TemplateRoot.create('./test/resources/valid-include.yml');
    });

    test('it contains same organization contents when loading directly', () => {
        expect(JSON.stringify(include.contents.Organization)).toBe(JSON.stringify(basic.contents.Organization));
    });
});

describe('when loading basic organization and regular cloudformation', () => {
    let template: TemplateRoot;
    let sandbox = Sinon.createSandbox();

    beforeEach(() => {
        sandbox.stub(ConsoleUtil, 'LogWarning');
        template = TemplateRoot.create('./test/resources/valid-regular-cloudformation.yml');
    });

    afterEach(() => {
        sandbox.restore();
    })

    test('template contains organization resource', () => {
        expect(template.organizationSection.resources.length).toBe(1);
    });

    test('template contains cloudformation resource', () => {
        expect(template.resourcesSection.resources.length).toBe(1);
    });
    test('template contains output', () => {
        expect(template.contents.Outputs).toBeDefined();
    });
});
