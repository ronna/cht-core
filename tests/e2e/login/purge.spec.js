const auth = require('../../auth')();
const commonElements = require('../../page-objects/common/common.po.js');
const reports = require('../../page-objects/reports/reports.po.js');
const utils = require('../../utils');
const loginPage = require('../../page-objects/login/login.po.js');
const sentinelUtils = require('../sentinel/utils');
const chai = require('chai');
const helper = require('../../helper');

/* global window */

describe('Purging on login', () => {

  const restrictedUserName = 'e2e_restricted';
  const restrictedPass = 'e2e_restricted';
  const restrictedFacilityId = 'restriced-facility';
  const restrictedContactId = 'restricted-contact';
  const patientId = 'e2e-patient';
  const goodFormId = 'good-form';
  const badFormId = 'bad-form';
  const badFormId2 = 'bad-form2';
  const goodFormId2 = 'good-form2';

  // TODO: at some point if we're feeling masochistic we can re-do this as
  // actual admin app interactions + restricted user interactions (to create reports)
  const restrictedUser = {
    _id: `org.couchdb.user:${restrictedUserName}`,
    type: 'user',
    name: restrictedUserName,
    password: restrictedPass,
    facility_id: restrictedFacilityId,
    roles: [
      'district-manager',
      'kujua_user',
      'data_entry',
      'district_admin'
    ]
  };
  const initialDocs = [
    {
      _id: `org.couchdb.user:${restrictedUserName}`,
      language: 'en',
      known: true,
      type: 'user-settings',
      roles: [
        'district-manager',
        'kujua_user',
        'data_entry',
        'district_admin'
      ],
      facility_id: restrictedFacilityId,
      contact_id: restrictedContactId,
      name: restrictedUserName
    },
    {
      _id: restrictedFacilityId,
      parent: {
        _id: 'this-does-not-matter'
      },
      name: 'A CHW area',
      type: 'health_center',
      reported_date: Date.now(),
      contact: {
        _id: restrictedContactId,
        parent: {
          _id: restrictedFacilityId,
          parent: {
            _id: 'this-does-not-matter'
          }
        }
      }
    },
    {
      _id: restrictedContactId,
      name: 'CHW User',
      type: 'person',
      reported_date: Date.now(),
      parent: {
        _id: restrictedFacilityId,
        parent: {
          _id: 'this-does-not-matter'
        }
      }
    },
    {
      _id: patientId,
      name: 'A patient',
      reported_date: Date.now(),
      type: 'person',
      parent: {
        _id: restrictedFacilityId,
        parent: {
          _id: 'this-does-not-matter'
        }
      }
    }
  ];
  const initialReports = [
    {
      _id: goodFormId,
      form: 'a-good-form-type',
      type: 'data_record',
      content_type: 'xml',
      reported_date: Date.now(),
      contact: {
        _id: restrictedContactId,
        parent: {
          _id: restrictedFacilityId,
          parent: {
            _id: 'this-does-not-matter'
          }
        }
      },
      fields: {
        patient_id: patientId,
        patient_name: 'A patient',
        some: 'data',
      }
    },
    {
      _id: badFormId,
      form: 'a-bad-form-type',
      type: 'data_record',
      content_type: 'xml',
      reported_date: Date.now(),
      contact: {
        _id: restrictedContactId,
        parent: {
          _id: restrictedFacilityId,
          parent: {
            _id: 'this-does-not-matter'
          }
        }
      },
      fields: {
        patient_id: patientId,
        patient_name: 'A patient',
        some: 'data',
      }
    }
  ];

  const subsequentReports = [
    {
      _id: goodFormId2,
      form: 'a-good-form-type',
      type: 'data_record',
      content_type: 'xml',
      reported_date: Date.now(),
      contact: {
        _id: restrictedContactId,
        parent: {
          _id: restrictedFacilityId,
          parent: {
            _id: 'this-does-not-matter'
          }
        }
      },
      fields: {
        patient_id: patientId,
        patient_name: 'A patient',
        some: 'data',
      }
    },
    {
      _id: badFormId2,
      form: 'a-bad-form-type',
      type: 'data_record',
      content_type: 'xml',
      reported_date: Date.now(),
      contact: {
        _id: restrictedContactId,
        parent: {
          _id: restrictedFacilityId,
          parent: {
            _id: 'this-does-not-matter'
          }
        }
      },
      fields: {
        patient_id: patientId,
        patient_name: 'A patient',
        some: 'data',
      }
    }
  ];

  const purgeFn = (userCtx, contact, reports) => {
    if (!userCtx.roles.includes('data_entry')) {
      // wrong user type - don't purge
      return [];
    }
    if (contact.type !== 'person') {
      // report not about person - don't purge
      return [];
    }
    return reports.filter(r => r.form === 'a-bad-form-type').map(r => r._id);
  };

  let originalTimeout;
  beforeAll(done => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
    let seq;
    return utils
      .saveDocs(initialReports.concat(initialDocs))
      .then(() => utils.request({
        path: `/_users/org.couchdb.user:${restrictedUserName}`,
        method: 'PUT',
        body: restrictedUser
      }))
      .then(() => sentinelUtils.getCurrentSeq())
      .then(result => seq = result)
      .then(() => utils.updateSettings({ purge: { fn: purgeFn.toString(), text_expression: 'every 1 seconds' } }, true))
      .then(() => restartSentinel())
      .then(() => sentinelUtils.waitForPurgeCompletion(seq))
      .then(() => done()).catch(done.fail);
  });

  afterAll(done => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    commonElements.goToLoginPage();
    loginPage.login(auth.username, auth.password);
    return Promise.all([
      utils.request(`/_users/org.couchdb.user:${restrictedUserName}`)
        .then(doc => utils.request({
          path: `/_users/org.couchdb.user:${restrictedUserName}?rev=${doc._rev}`,
          method: 'DELETE'
        })),
      utils.revertDb()
    ])
      .then(() => sentinelUtils.deletePurgeDbs())
      .then(() => done()).catch(done.fail);
  });

  beforeEach(utils.beforeEach);
  afterEach(utils.afterEach);

  const getPurgeLog = () => {
    return browser.executeAsyncScript((() => {
      const callback = arguments[arguments.length - 1];
      const db = window.PouchDB('medic-user-e2e_restricted');
      db.get('_local/purgelog')
        .then(doc => callback(doc))
        .catch(err => callback(err));
    }));
  };

  const restartSentinel = () => utils.stopSentinel().then(() => utils.startSentinel());

  it('Logging in as a restricted user with configured purge rules should not download purged docs', () => {
    utils.resetBrowser();
    commonElements.goToLoginPage();
    loginPage.login(restrictedUserName, restrictedPass);
    commonElements.calm();
    commonElements.goToReports();
    reports.expectReportsToExist([goodFormId]);
    reports.expectReportsToNotExist([badFormId]);

    let purgeDate;

    return getPurgeLog()
      .then(result => {
        // purge ran but after initial replication, nothing to purge
        chai.expect(result._rev).to.equal('0-1');
        chai.expect(result.roles).to.equal(JSON.stringify(restrictedUser.roles.sort()));
        chai.expect(result.history.length).to.equal(1);
        chai.expect(result.count).to.equal(0);
        chai.expect(result.history[0]).to.deep.equal({
          count: 0,
          roles: result.roles,
          date: result.date
        });
        purgeDate = result.date;
      })
      .then(() => {
        utils.resetBrowser();
        commonElements.calm();
        helper.waitForAngularComplete();
        return getPurgeLog();
      })
      .then(result => {
        // purge didn't run again on next refresh
        chai.expect(result._rev).to.equal('0-1');
        chai.expect(result.date).to.equal(purgeDate);
      })
      .then(() => {
        browser.wait(() => utils.saveDocs(subsequentReports).then(() => true));
        commonElements.sync();
        commonElements.goToReports();
        reports.expectReportsToExist([goodFormId, goodFormId2, badFormId2]);

        browser.wait(() => {
          let seq;
          const purgeSettings = {
            fn: purgeFn.toString(),
            text_expression: 'every 1 seconds',
            run_every_days: '0'
          };
          return utils.revertSettings(true)
            .then(() => sentinelUtils.getCurrentSeq())
            .then(result => seq = result)
            .then(() => utils.updateSettings({ purge: purgeSettings}, true))
            .then(() => restartSentinel())
            .then(() => sentinelUtils.waitForPurgeCompletion(seq))
            .then(() => true);
        });
        // get new settings that say to purge on every boot!
        commonElements.sync();
        utils.refreshToGetNewSettings();
        commonElements.calm();
        return getPurgeLog();
      })
      .then(result => {
        // purge ran again and it purged the bad form
        chai.expect(result._rev).to.equal('0-2');
        chai.expect(result.roles).to.equal(JSON.stringify(restrictedUser.roles.sort()));
        chai.expect(result.history.length).to.equal(2);
        chai.expect(result.count).to.equal(1);
        chai.expect(result.history[1].date).to.equal(purgeDate);
        chai.expect(result.history[0]).to.deep.equal({
          count: 1,
          roles: result.roles,
          date: result.date
        });
      })
      .then(() => {
        commonElements.goToReports();
        reports.expectReportsToExist([goodFormId, goodFormId2]);
        reports.expectReportsToNotExist([badFormId, badFormId2]);
      });
  });
});
