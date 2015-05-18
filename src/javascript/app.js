Ext.define("ts-feature-schedule-report", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    portfolioItemFeature: 'PortfolioItem/Feature',
    featureFetchList: ['FormattedID','Name','c_FeatureTargetSprint','Project','State','c_CodeDeploymentSchedule','DisplayColor'],
    pivotFieldName: 'c_FeatureTargetSprint',
    otherText: 'Needs Fixed',
    allReleasesText: 'All Releases',

    onNoAvailableTimeboxes: function(){
        this.logger.log('No available releases');
    },
    onScopeChange: function(scope){
        this.logger.log('onScopeChange', scope);
        this._updateApp(scope.getRecord());
    },
    launch: function(){
        this._initLayoutComponents();
    },
    _updateApp: function(){
        this.logger.log('_updateApp');
        Deft.Chain.pipeline([
            this._fetchFeatureData,
            this._createDataStore
        ], this);
    },
    _fetchPivotFields: function(){
        var deferred = Ext.create('Deft.Deferred');
        var pivotFieldName = this.pivotFieldName;

        Rally.data.wsapi.ModelFactory.getModel({
            type: this.portfolioItemFeature,
            success: function(model) {
                var field = model.getField(pivotFieldName);
                return field.getAllowedValueStore().load({
                    scope: this,
                    callback: function(records, operation, success){
                        if (success){
                            var pivotFields = [];
                            _.each(records, function(r){
                                if (r && r.get('StringValue') && r.get('StringValue').length > 0){
                                    pivotFields.push(r.get('StringValue'));
                                }
                            });
                            deferred.resolve(pivotFields);
                        } else {
                            deferred.reject(operation);
                        }
                    }
                });
            }
        });
        return deferred;
    },
    _getReleaseFilters: function(){
        var releaseValue = this.down('#cb-release').getValue();
        this.logger.log('_getReleaseFilters',releaseValue);
        if (releaseValue == ''){  //=== this.allReleasesText){
            return [];
        }

        var release = this.down('#cb-release').getRecord(),
            filters = [];

        if (release){

            filters = [{
                property: 'Release.Name',
                value: release.get('Name')
            },{
                property: 'Release.ReleaseStartDate',
                value: release.get('ReleaseStartDate')
            },{
                property: 'Release.ReleaseDate',
                value: release.get('ReleaseDate')
            }];
        } else {
            filters = [{
                property: 'Release',
                value: ''
            }];
        }
        return filters;

    },
    _fetchFeatureData: function(){

        var store = Ext.create('Rally.data.wsapi.Store',{
            model: this.portfolioItemFeature,
            fetch: this.featureFetchList,
            filters: this._getReleaseFilters(),
            context: {projectScopeDown: true}
        });

        return store.load({
            callback: function(records, operation, success){
                return records;
            },
            scope: this
        });
    },
    _buildDataStore: function(records, pivotFieldValues){
        var projects = {},
            pivotFieldName = this.pivotFieldName;
        _.each(records, function(r){
            var project_oid = r.get('Project')._ref;
            if (projects[project_oid] == undefined){
                projects[project_oid] = [];
            }
            projects[project_oid].push(r);
        });

        var otherText = this.otherText;
        var modelFields = [{name: 'Project', type: 'string'},{name: otherText, type:'string'}].concat(
            _.map(pivotFieldValues, function(pf){return {name: pf, type:'string'}}));


        var data = [];
        _.each(projects, function(objs, project_oid){
            var rec = {Project: objs[0].get('Project').Name};
            rec[otherText] = [];
            _.each(pivotFieldValues, function(pf){
                rec[pf] = [];
            });

            _.each(objs, function(obj){
                var pivotValue = obj.get(pivotFieldName) || otherText;
                if (_.indexOf(pivotFieldValues,pivotValue) >= 0){
                    rec[pivotValue].push(obj.getData());
                } else {
                    rec[otherText].push(obj.getData());
                }
            });
            data.push(rec);
        });

        this.logger.log('data for store', data);

        var store= Ext.create('Rally.data.custom.Store',{
            data: data,
            pageSize: data.length
        });
        return store;

    },
    _createDataStore: function(records) {
        var pivotFieldName = this.pivotFieldName;

        this._fetchPivotFields().then({
            scope: this,
            success: function(pivotFieldValues){
                var store = this._buildDataStore(records, pivotFieldValues);
                this._createGrid(store, pivotFieldValues);
            }
        });
    },
    _createGrid: function(store, pivotFields) {
        this.logger.log('_createGrid',store);

        this.down('#ct-body').removeAll();

        this.down('#ct-body').add({
            xtype: 'rallygrid',
            columnCfgs: [
                {dataIndex: 'Project', text: 'Project'},
                {dataIndex: this.otherText, text: this.otherText, renderer: this._featureRenderer},
            ].concat(_.map(pivotFields, function(pivotField) {
                    return {
                        dataIndex: pivotField,
                        flex: 1,
                        text: pivotField,
                        renderer: this._featureRenderer
                    };
                },this)),
            store: store,
            showPagingToolbar: false
        });
    },
    _featureRenderer: function(value, metadata, record){
            console.log('renderer', value, record);
        metadata.tdCls = 'ts-column-style';
            if (value && value.length > 0){
                var msg = '';
                _.each(value, function(v){
                    var state = v.State ? v.State.Name : '',
                        cds = v.c_CodeDeploymentSchedule ? v.c_CodeDeploymentSchedule : 'Missing',
                        warning = '';
                    if (v.c_CodeDeploymentSchedule){
                        cds = v.c_CodeDeploymentSchedule;
                    } else {
                        cds = '<img src="/slm/images/icon_alert_sm.gif" alt="CDS Missing" title="Warning: Code Deployment Schedule is missing!"><span class="ts-warning">Missing</span>';
            //            warning = '<img src="/slm/images/icon_alert_sm.gif" alt="CDS Missing" title="Warning: Code Deployment Schedule is missing!">';
                    }

                    msg += Ext.String.format('<div class="tscolor" style="background-color:{0};width:10px;height:10px;"></div>{1}[{2}]{3}: {4}<br/><b><i>{5}</i></b><hr class="ts-separator"/>',
                        v.DisplayColor,
                        warning,
                        state,
                        v.FormattedID,
                        v.Name,
                        cds);
                });
                return msg.replace(/<hr class="ts-separator"\/>$/,'');
            }
            return '';

    },
    _initLayoutComponents: function(){
        //Add the high level body components if they haven't already been added.
        if (!this.down('tsinfolink')){
            this.add({xtype:'container',itemId:'ct-header', cls: 'header', layout: {type: 'hbox'}});
            this.add({xtype:'container',itemId:'ct-body'});
            this.add({xtype:'tsinfolink'});

            this.down('#ct-header').add({
                xtype: 'rallyreleasecombobox',
                fieldLabel: 'Release',
                itemId: 'cb-release',
                labelAlign: 'right',
                width: 300,
                allowClear: true,
                clearText: this.allReleasesText,
                allowNoEntry: true,
                allowBlank: true,
                //storeConfig: {
                //    listeners: {
                //        scope: this,
                //        load: this._addAllOption
                //    }
                //},
                listeners: {
                    scope: this,
                    change: this.onScopeChange
                }
            });
        }
    },
    _addAllOption: function(store){
        store.add({Name: this.allReleasesText, formattedName: this.allReleasesText});
    }
});
